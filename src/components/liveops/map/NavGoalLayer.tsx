import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleMarker, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, MapPin } from 'lucide-react'
import { Button } from '@/components/kit'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import { fromLatLng, markerRotationDeg, toLatLng } from '@/liveops/mapCoords'
import {
  MIN_HEADING_DRAG_M, navGoalFrom, navGotoParams, robotPlacementProblem, type NavGoal, type NavGoalRefusal,
} from '@/liveops/navGoal'
import { navCommandNotice, noticeShowMs, type NavNotice } from '@/liveops/navLocate'
import {
  NAV_UI_IDLE, activeNavGoal, initialEndedTrack, isMapSurface, navBarModel, navHint, navToolsModel, navUiReducer, settlePose,
  trackEnded, type NavBarModel, type NavHint, type NavToolState, type NavUiAction, type NavUiState,
} from '@/liveops/navMode'
import { useFloorGrids } from '@/missions/useFloorGrids'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { CommandAvailability, CommandType, RobotState } from '@/types'
import type { MapFloor, Point2D, SiteMap } from '@/types/maps'
import type { NavGoalStatus } from '@/types/robotState'

/**
 * Tap-to-go on the LiveOps map (option A, "Go mode button", 2026-11-10).
 *
 * Four thin pieces over `liveops/navMode` and `liveops/navGoal`, composed by
 * MapCanvas the way it composes its other layers:
 * - `NavGoalMarkers` and `NavMapInput` live INSIDE the Leaflet container: the
 *   pin, the dashed line to it and the Set-position arrow; the clicks and the
 *   press-drag-release.
 * - `NavTools` (top-left) and `NavBar` (bottom-centre) are SIBLINGS of it, as
 *   CloudPanelOverlay is, so pressing Walk or Stop can never also be read by
 *   the map as a tap.
 * `useNavGoal` holds the state and sends the commands.
 *
 * E-Stop is not here: it stays where it is in the command bar.
 */

/** How long "Arrived" / "Stopped: ..." stays in the bar. */
export const ENDED_SHOW_MS = 6000

/** A map point as Leaflet gave it. */
const toPoint = (latlng: { lat: number; lng: number }): Point2D => {
  const { x_m, y_m } = fromLatLng(latlng)
  return [x_m, y_m]
}

// ── Markers ──────────────────────────────────────────────────────────────────

const PIN_HALO = 16
const PIN_CORE = 7

function Pin({ at, tone }: { at: { x_m: number; y_m: number }; tone: 'accent' | 'red' }) {
  const c = tone === 'red' ? color.red : color.accent
  const center = toLatLng(at.x_m, at.y_m)
  return (
    <>
      <CircleMarker center={center} radius={PIN_HALO} interactive={false} pathOptions={{ stroke: false, fillColor: c, fillOpacity: 0.18 }} />
      <CircleMarker center={center} radius={PIN_CORE} interactive={false} pathOptions={{ color: color.t1, weight: 2, fillColor: c, fillOpacity: 1 }} />
    </>
  )
}

function DashedLine({ from, to }: { from: { x_m: number; y_m: number }; to: { x_m: number; y_m: number } }) {
  return (
    <Polyline
      positions={[toLatLng(from.x_m, from.y_m), toLatLng(to.x_m, to.y_m)]}
      interactive={false}
      pathOptions={{ color: color.accent, weight: 2, dashArray: '6 6' }}
    />
  )
}

/** The arrowhead at the end of a Set-position drag, turned the way the robot will face. */
function arrowIcon(headingDeg: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;transform:rotate(${markerRotationDeg(headingDeg)}deg);pointer-events:none;">
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid ${color.accent};"></div>
    </div>`,
  })
}

/**
 * What the layer draws: the pending pin (red when refused) and the dashed line
 * from the robot to it; the goal the robot is walking to; and, in Set position,
 * the robot's spot and the arrow of the drag. Nothing when there is none of
 * those. No hooks, so it is a plain function of its props.
 */
export function NavGoalMarkers({ from, pending, pendingRefused, walking, pose }: {
  /** The robot's map position, or null when it is not on the map. */
  from: { x_m: number; y_m: number } | null
  pending: Point2D | null
  pendingRefused: boolean
  walking: Pick<NavGoalStatus, 'x_m' | 'y_m'> | null
  pose: NavUiState['pose']
}) {
  const pin = pending ? { x_m: pending[0], y_m: pending[1] } : null
  if (!pin && !walking && !pose) return null
  const dx = pose ? pose.toward[0] - pose.at[0] : 0
  const dy = pose ? pose.toward[1] - pose.at[1] : 0
  const dragged = pose !== null && Math.hypot(dx, dy) >= MIN_HEADING_DRAG_M
  return (
    <>
      {walking && from && <DashedLine from={from} to={walking} />}
      {walking && <Pin at={walking} tone="accent" />}
      {pin && from && !pendingRefused && <DashedLine from={from} to={pin} />}
      {pin && <Pin at={pin} tone={pendingRefused ? 'red' : 'accent'} />}
      {pose && (
        <>
          <CircleMarker
            center={toLatLng(pose.at[0], pose.at[1])} radius={14} interactive={false}
            pathOptions={{ color: color.accent, weight: 2, fillColor: color.card, fillOpacity: 1 }}
          />
          {dragged && (
            <>
              <Polyline
                positions={[toLatLng(pose.at[0], pose.at[1]), toLatLng(pose.toward[0], pose.toward[1])]}
                interactive={false} pathOptions={{ color: color.accent, weight: 2 }}
              />
              <Marker
                position={toLatLng(pose.toward[0], pose.toward[1])} interactive={false} keyboard={false}
                icon={arrowIcon((Math.atan2(dy, dx) * 180) / Math.PI)}
              />
            </>
          )}
        </>
      )}
    </>
  )
}

// ── Input ────────────────────────────────────────────────────────────────────

/**
 * Turns map input into nav actions. Go mode: a click on the map (not on a
 * control floating over it) is a tap. Set position: the map stops panning, and
 * a press, drag and release on it is a pose. Esc leaves either mode. Memoized:
 * its props are stable between telemetry frames, so its map listeners are not
 * re-bound on each one.
 */
export const NavMapInput = memo(function NavMapInput({ mode, onTap, onPress, onDrag, onRelease, onEscape }: {
  mode: NavUiState['mode']
  onTap: (point: Point2D) => void
  onPress: (point: Point2D) => void
  onDrag: (point: Point2D) => void
  onRelease: (point: Point2D) => void
  onEscape: () => void
}) {
  const map = useMap()
  // Latest handlers without re-binding the listeners on every telemetry frame.
  const handlers = useRef({ onTap, onPress, onDrag, onRelease, onEscape })
  useEffect(() => { handlers.current = { onTap, onPress, onDrag, onRelease, onEscape } })

  const onMap = useCallback((target: EventTarget | null) =>
    isMapSurface(target, map.getContainer(), map.getPanes().mapPane), [map])

  useMapEvents({
    click: (e) => {
      if (mode === 'go' && onMap(e.originalEvent.target)) handlers.current.onTap(toPoint(e.latlng))
    },
  })

  useEffect(() => {
    if (mode === 'idle') return
    const container = map.getContainer()
    container.style.cursor = 'crosshair'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handlers.current.onEscape() }
    window.addEventListener('keydown', onKey)
    return () => {
      container.style.cursor = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [map, mode])

  useEffect(() => {
    if (mode !== 'setPosition') return
    const container = map.getContainer()
    const wasDragging = map.dragging.enabled()
    map.dragging.disable()
    let pressing: number | null = null
    const at = (e: PointerEvent) => toPoint(map.mouseEventToLatLng(e))
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !onMap(e.target)) return
      pressing = e.pointerId
      container.setPointerCapture?.(e.pointerId)
      handlers.current.onPress(at(e))
    }
    const move = (e: PointerEvent) => { if (pressing === e.pointerId) handlers.current.onDrag(at(e)) }
    const up = (e: PointerEvent) => {
      if (pressing !== e.pointerId) return
      pressing = null
      container.releasePointerCapture?.(e.pointerId)
      handlers.current.onRelease(at(e))
    }
    container.addEventListener('pointerdown', down)
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerup', up)
    container.addEventListener('pointercancel', up)
    return () => {
      container.removeEventListener('pointerdown', down)
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerup', up)
      container.removeEventListener('pointercancel', up)
      if (wasDragging) map.dragging.enable()
    }
  }, [map, mode, onMap])

  return null
})

// ── Floating controls ────────────────────────────────────────────────────────

const ICON_SIZE = 15

function ToolButton({ tool, label, icon: Icon, onClick }: {
  tool: NavToolState
  label: string
  icon: React.ElementType
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={tool.active}
      disabled={!tool.enabled}
      title={tool.reason ?? label}
      onClick={onClick}
      style={{
        height: 32, padding: `0 ${space[3]}px`, border: 'none', borderRadius: radius.sm + 1,
        display: 'flex', alignItems: 'center', gap: space[2], whiteSpace: 'nowrap',
        fontFamily: font.family, fontSize: font.size.md, fontWeight: font.weight.semibold,
        cursor: tool.enabled ? 'pointer' : 'not-allowed',
        background: tool.active ? color.accentDim : 'transparent',
        color: !tool.enabled ? color.t4 : tool.active ? color.t1 : color.t2,
      }}
    >
      <Icon size={ICON_SIZE} strokeWidth={1.8} aria-hidden color={tool.enabled && tool.active ? color.accent : 'currentColor'} />
      {label}
    </button>
  )
}

const HINT_DOT: Record<NonNullable<NavHint>['tone'], string | null> = { muted: null, amber: color.amber, red: color.red }

/**
 * The tool group at the map's top-left -- Go to point and Set position, one
 * mode at a time -- and the hint line under it. Memoized with stable handlers:
 * MapCanvas re-renders on every telemetry frame.
 */
export const NavTools = memo(function NavTools({ go, setPosition, hint, onToggle, top = 12, left = 12 }: {
  go: NavToolState
  setPosition: NavToolState
  hint: NavHint
  onToggle: (mode: 'go' | 'setPosition') => void
  top?: number
  left?: number
}) {
  const { t } = useTranslation()
  return (
    <div style={{ position: 'absolute', top, left, zIndex: 1001, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space[2] }}>
      <div
        role="group"
        aria-label={t('liveops.nav.tools')}
        style={{
          ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-md)',
          display: 'flex', gap: space[1], padding: space[1], borderRadius: radius.lg,
        }}
      >
        <ToolButton tool={go} label={t('liveops.nav.goTool')} icon={MapPin} onClick={() => onToggle('go')} />
        <ToolButton tool={setPosition} label={t('liveops.nav.setPositionTool')} icon={Crosshair} onClick={() => onToggle('setPosition')} />
      </div>
      {hint && (
        <div
          role="status"
          style={{
            ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
            display: 'flex', alignItems: 'center', gap: space[2], maxWidth: 320,
            padding: `${space[1]}px ${space[2] + 2}px`, borderRadius: radius.sm + 1,
            fontFamily: font.family, fontSize: font.size.sm, lineHeight: 1.4,
            color: hint.tone === 'muted' ? color.t2 : hint.tone === 'amber' ? color.amber : color.red,
          }}
        >
          {HINT_DOT[hint.tone] && <Dot c={HINT_DOT[hint.tone]!} size={6} />}
          {hint.text}
        </div>
      )}
    </div>
  )
})

function Dot({ c, size = 8 }: { c: string; size?: number }) {
  return <span aria-hidden style={{ width: size, height: size, borderRadius: radius.full, background: c, flexShrink: 0 }} />
}

/** A tinted line of text with a dot: a warning, a refusal, a reason. No outline. */
function Chip({ tone, children }: { tone: 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const fg = tone === 'amber' ? color.amber : tone === 'red' ? color.red : color.t1
  const bg = tone === 'amber' ? color.amberBg : tone === 'red' ? color.redBg : color.selected
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: space[2], padding: `${space[2]}px ${space[3]}px`,
      borderRadius: radius.sm + 1, background: bg, color: fg, fontSize: font.size.md, lineHeight: 1.4,
    }}>
      <span style={{ marginTop: 6, display: 'flex' }}><Dot c={tone === 'neutral' ? color.t3 : fg} size={6} /></span>
      <span>{children}</span>
    </div>
  )
}

const BAR_BUTTON: React.CSSProperties = { height: 36, padding: `0 ${space[4]}px`, border: 'none' }
const TONE_DOT = { green: color.green, neutral: color.t3, red: color.red } as const

function TitleBlock({ title, detail }: { title: string; detail: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, letterSpacing: font.tracking.tight, color: color.t1 }}>{title}</span>
      {detail && <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>{detail}</span>}
    </div>
  )
}

/**
 * The bar at the bottom-centre of the map: one NavBarModel, drawn. Walk is the
 * primary button; a warning sits ABOVE it, before confirm; a refusal takes its
 * place. While a goal walks, a large Stop sends NAV_CANCEL.
 */
export function NavBar({ model, placement = 'bottom', onCancel, onWalk, onStop, onSetPosition }: {
  model: NavBarModel
  /** `top` while the manual-control panel holds the bottom-centre. */
  placement?: 'bottom' | 'top'
  onCancel: () => void
  onWalk: () => void
  onStop: () => void
  onSetPosition: () => void
}) {
  const { t } = useTranslation()
  if (model.kind === 'none') return null

  const row = (children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>{children}</div>
  )
  let body: React.ReactNode
  switch (model.kind) {
    case 'walking':
      body = row(<>
        <Dot c={color.accent} />
        <TitleBlock title={model.title} detail={model.detail} />
        <Button
          variant="danger"
          onClick={onStop}
          style={{ ...BAR_BUTTON, height: 44, padding: `0 ${space[5]}px`, background: color.red, color: '#ffffff', fontSize: font.size.lg, fontWeight: font.weight.bold }}
        >
          {t('liveops.nav.stop')}
        </Button>
      </>)
      break
    case 'confirm':
      body = <>
        {model.warnings.map((w) => <Chip key={w} tone="amber">{w}</Chip>)}
        {!model.walk.enabled && model.walk.reason && <Chip tone="neutral">{model.walk.reason}</Chip>}
        {row(<>
          <TitleBlock title={model.title} detail={model.detail} />
          <Button variant="ghost" onClick={onCancel} style={{ ...BAR_BUTTON, background: color.selected, color: color.t1 }}>
            {t('liveops.nav.cancel')}
          </Button>
          <Button
            variant="primary" onClick={onWalk} disabled={!model.walk.enabled}
            title={model.walk.enabled ? undefined : model.walk.reason}
            style={{ ...BAR_BUTTON, fontWeight: font.weight.bold }}
          >
            {t('liveops.nav.walk')}
          </Button>
        </>)}
      </>
      break
    case 'refused':
      body = row(<>
        <div style={{ flex: 1, minWidth: 0 }}><Chip tone="red">{model.text}</Chip></div>
        <Button variant="ghost" onClick={onCancel} style={{ ...BAR_BUTTON, background: color.selected, color: color.t1 }}>
          {t('liveops.nav.cancel')}
        </Button>
      </>)
      break
    case 'notPlaced':
      body = row(<>
        <span style={{ flex: 1, fontSize: font.size.md, lineHeight: 1.4, color: color.t1 }}>{model.text}</span>
        <Button variant="primary" onClick={onSetPosition} style={{ ...BAR_BUTTON, padding: `0 ${space[3]}px`, fontWeight: font.weight.bold }}>
          {t('liveops.nav.setPosition')}
        </Button>
      </>)
      break
    case 'ended':
      body = row(<>
        <Dot c={TONE_DOT[model.tone]} />
        <span style={{ fontSize: font.size.md, color: color.t1, paddingRight: space[2] }}>{model.text}</span>
      </>)
      break
    case 'notice':
      // A confirmation reads like "Arrived"; anything to check or act on is a
      // chip, with Set position beside it when that is the fix.
      body = model.tone === 'green'
        ? row(<>
          <Dot c={TONE_DOT.green} />
          <span style={{ fontSize: font.size.md, color: color.t1, paddingRight: space[2] }}>{model.text}</span>
        </>)
        : row(<>
          <div style={{ flex: 1, minWidth: 0 }}><Chip tone={model.tone}>{model.text}</Chip></div>
          {model.setPosition && (
            <Button variant="primary" onClick={onSetPosition} style={{ ...BAR_BUTTON, padding: `0 ${space[3]}px`, fontWeight: font.weight.bold }}>
              {t('liveops.nav.setPosition')}
            </Button>
          )}
        </>)
      break
  }

  return (
    <div
      role="region"
      aria-label={t('liveops.nav.goTool')}
      aria-live="polite"
      style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: 1001,
        ...(placement === 'top' ? { top: 12 } : { bottom: 16 }),
        width: 'max-content', maxWidth: 'min(520px, calc(100% - 24px))', boxSizing: 'border-box',
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-md)',
        display: 'flex', flexDirection: 'column', gap: space[2],
        padding: `${space[2]}px ${space[2]}px ${space[2]}px ${space[4]}px`, borderRadius: radius.lg,
        fontFamily: font.family, color: color.t1,
      }}
    >
      {body}
    </div>
  )
}

// ── State and commands ───────────────────────────────────────────────────────

const OFF: CommandAvailability = { enabled: false }

/** The floor id NAV_GOTO and RESET_POSITION name: the floor's index, as text. */
export const floorIdOf = (floor: Pick<MapFloor, 'index'>) => String(floor.index)

/**
 * Everything the four pieces need, for one robot on one floor of one map.
 * `map`/`floor` undefined turns it all off (the mini inset, a canvas with no
 * survey): no grid is fetched and nothing is drawn.
 */
export function useNavGoal(robot: RobotState, map: SiteMap | undefined, floor: MapFloor | undefined) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const dispatchCommandAsync = useLiveOpsStore((s) => s.dispatchCommandAsync)
  const [ui, dispatch] = useReducer(navUiReducer, NAV_UI_IDLE)
  const grids = useFloorGrids(map)
  const grid = floor ? grids[floor.index] : undefined

  // What the robot said back about the last Set position or walk (navLocate):
  // shown until the operator's next map action, or for noticeShowMs. `sent`
  // numbers each send, so a late answer to an older one never shows.
  const [notice, setNotice] = useState<NavNotice | null>(null)
  const sent = useRef(0)
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice((n) => (n === notice ? null : n)), noticeShowMs(notice))
    return () => clearTimeout(id)
  }, [notice])

  // A pin on another floor, map or robot means nothing here; nor does what
  // the last robot said.
  useEffect(() => {
    dispatch({ type: 'exit' })
    sent.current++
    setNotice(null)
  }, [robot.robot_id, map?.map_id, floor?.index])

  // Finished goals, shown for a few seconds (adjusted during render, as React
  // recommends for state derived from a changing prop).
  const [track, setTrack] = useState(() => initialEndedTrack(robot.robot_id, robot.nav_goal))
  const nextTrack = trackEnded(track, robot.robot_id, robot.nav_goal)
  if (nextTrack !== track) setTrack(nextTrack)
  const endedId = nextTrack.ended ? `${nextTrack.ended.goal_id}/${nextTrack.ended.state}` : null
  useEffect(() => {
    if (!endedId) return
    const id = setTimeout(() => setTrack((s) => (s.ended ? { ...s, ended: null } : s)), ENDED_SHOW_MS)
    return () => clearTimeout(id)
  }, [endedId])

  const walkingGoal = activeNavGoal(robot)
  const placed = robotPlacementProblem(robot) === null
  const goal: NavGoal | NavGoalRefusal | null = useMemo(
    () => (ui.pending && floor ? navGoalFrom(ui.pending, floor, grid, robot, map?.zones ?? []) : null),
    // `robot` changes every frame; only its position decides the goal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui.pending, floor, grid, map?.zones, robot.position],
  )
  // Off (no survey, or the inset): nothing is asked of the robot at all.
  const on = !!map && !!floor
  const walk = on ? getCommandAvailability(robot, 'NAV_GOTO') : OFF
  const setPositionPolicy = on ? getCommandAvailability(robot, 'RESET_POSITION') : OFF
  const walking = walkingGoal !== null
  // Memoized on what they read, so the memoized NavTools skips telemetry frames.
  const tools = useMemo(
    () => navToolsModel({ ui, walking, setPosition: { enabled: setPositionPolicy.enabled, reason: setPositionPolicy.reason } }),
    [ui, walking, setPositionPolicy.enabled, setPositionPolicy.reason],
  )
  const hint = useMemo(() => navHint(ui, placed), [ui, placed])
  const bar = navBarModel({ ui, robot, goal, walk, ended: nextTrack.ended, notice })

  // A tool that stops being usable (a walk starts, someone takes control)
  // takes its mode with it.
  const modeUsable = ui.mode === 'idle' || (ui.mode === 'go' ? tools.go.enabled : tools.setPosition.enabled)
  useEffect(() => { if (!modeUsable) dispatch({ type: 'exit' }) }, [modeUsable])

  const latest = useRef({ robot, map, floor, grid, goal, walk, pose: ui.pose })
  useEffect(() => { latest.current = { robot, map, floor, grid, goal, walk, pose: ui.pose } })

  // A map action: the notice has been seen, and the operator has moved on.
  const act = useCallback((action: NavUiAction) => { setNotice(null); dispatch(action) }, [])
  const onToggle = useCallback((mode: 'go' | 'setPosition') => act({ type: 'toggle', mode }), [act])
  const onCancel = useCallback(() => act({ type: 'cancel' }), [act])
  const onEscape = useCallback(() => act({ type: 'exit' }), [act])
  const onTap = useCallback((point: Point2D) => act({ type: 'tap', point }), [act])
  const onPress = useCallback((point: Point2D) => act({ type: 'press', point }), [act])
  const onDrag = useCallback((point: Point2D) => dispatch({ type: 'drag', point }), [])
  const onSetPosition = useCallback(() => act({ type: 'toggle', mode: 'setPosition' }), [act])

  /** Sends NAV_GOTO or RESET_POSITION, and shows what its ack has to say. */
  const send = useCallback((robotId: string, type: CommandType, label: string, params: Record<string, unknown>) => {
    const seq = ++sent.current
    setNotice(null)
    void dispatchCommandAsync(robotId, type, label, params).then(({ command }) => {
      const next = navCommandNotice(command)
      if (next && seq === sent.current) setNotice(next)
    })
  }, [dispatchCommandAsync])

  const onWalk = useCallback(() => {
    const { robot: r, map: m, floor: f, goal: g, walk: w } = latest.current
    if (!m || !f || !g?.ok || !w.enabled) return
    send(r.robot_id, 'NAV_GOTO', t('liveops.nav.walkCommand'), { ...navGotoParams(g, m.map_id, floorIdOf(f)) })
    dispatch({ type: 'exit' })
  }, [send, t])

  const onStop = useCallback(() => {
    dispatchCommand(latest.current.robot.robot_id, 'NAV_CANCEL', t('liveops.nav.stopCommand'))
  }, [dispatchCommand, t])

  const onRelease = useCallback((point: Point2D) => {
    const { robot: r, map: m, floor: f, grid: gr, pose } = latest.current
    if (!m || !f || !pose) return
    const settled = settlePose(pose.at, point, f, gr, m.map_id, floorIdOf(f))
    if (!settled.ok) { dispatch({ type: 'poseFailed', problem: settled.problem }); return }
    send(r.robot_id, 'RESET_POSITION', t('liveops.nav.setPositionCommand'), { ...settled.params })
    dispatch({ type: 'exit' })
  }, [send, t])

  const from = placed ? robot.position : null
  return {
    ui,
    markers: {
      from: from ? { x_m: from.x_m, y_m: from.y_m } : null,
      pending: ui.pending,
      pendingRefused: goal !== null && !goal.ok,
      walking: walkingGoal,
      pose: ui.pose,
    },
    input: { mode: ui.mode, onTap, onPress, onDrag, onRelease, onEscape },
    tools: { go: tools.go, setPosition: tools.setPosition, hint, onToggle },
    bar: {
      model: bar, onCancel, onWalk, onStop, onSetPosition,
      // The manual-control panel holds the bottom-centre while this operator drives.
      placement: operatorHoldsControl(robot) ? 'top' as const : 'bottom' as const,
    },
  }
}

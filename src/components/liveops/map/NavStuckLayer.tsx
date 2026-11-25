import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleMarker, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { Button } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { controlHolderName, useControlHolderNames } from '@/liveops/controlOwner'
import { toLatLng } from '@/liveops/mapCoords'
import { navGoalOutcome, readNavGoal } from '@/liveops/navGoal'
import {
  defaultRouteId, formatEstimate, formatRouteM, goLabel, initialStuckTrack, midpointOf, navResolveParams, nextStuckTrack,
  routeName, routeNote, routeTag, stuckAnswerable, stuckBox, stuckDeadlineMs, stuckEpisodeOf, stuckFractionLeft,
  stuckReasonText, stuckRoutes, type NavResolveChoice, type RouteKind, type StuckEpisode, type StuckRoute,
} from '@/liveops/navStuck'
import { refusalText } from '@/lib/refusals'
import { useSceneData } from '@/scene3d/useSceneData'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import type { MapFloor, Point2D, SiteMap } from '@/types/maps'
import { usePaintedFloorUrl, type PaintedFloor } from './useFloorCanvas'

/**
 * When a walk gets stuck (schema 0.0.27), on the LiveOps map: the bridge holds
 * the walk and offers other ways to the goal. Three pieces, composed the way
 * NavGoalLayer's are:
 * - `StuckRoutesLayer` lives inside the Leaflet container: the route that
 *   failed (red, dotted, a cross where it stopped) and each offered route in
 *   its own colour with its length on it. A focused route is bold, the others
 *   dimmed.
 * - `NavStuckCard` takes the walk bar's place: why, one row per route with a
 *   small drawing of it on the same floor, Go / Try again / Cancel, and the
 *   minute the robot waits.
 * - `useNavStuck` holds which route is picked and pointed at, and sends the
 *   answer (NAV_RESOLVE).
 * The rules are in liveops/navStuck.ts.
 */

/** Each route's colour token. */
export const ROUTE_COLOUR: Record<RouteKind, string> = {
  a: color.routeA, b: color.routeB, nearest: color.routeNearest, back: color.routeBack,
}

/** The way back is dashed, as in the mock; the rest are solid. */
const ROUTE_DASH: Record<RouteKind, string | undefined> = { a: undefined, b: undefined, nearest: undefined, back: '8 7' }

/** What the map and the card share about a stuck walk on screen. */
export interface StuckView {
  episode: StuckEpisode
  routes: StuckRoute[]
  /** The route pointed at, else the one picked: bold on the map. */
  focus: string | null
}

// ── The map ──────────────────────────────────────────────────────────────────

/** A route's label on its line: "A 10.4 m", white on the route's colour. */
function tagIcon(text: string, background: string, dim: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;pointer-events:none;`
      + `padding:2px 7px;border-radius:6px;background:${background};color:#ffffff;opacity:${dim ? 0.3 : 1};`
      + `font:600 12px/1.4 'Outfit','Pretendard Variable',system-ui,sans-serif;box-shadow:var(--rh-shadow-sm);">${text}</div>`,
  })
}

/** The cross where the walk got stuck: made on first use, not at import. */
let crossIconMade: L.DivIcon | null = null
function crossIcon(): L.DivIcon {
  crossIconMade ??= L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<svg width="16" height="16" viewBox="-8 -8 16 16" style="display:block;pointer-events:none" aria-hidden="true">`
      + `<path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="${color.red}" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  })
  return crossIconMade
}

const latLngs = (points: readonly Point2D[]) => points.map(([x, y]) => toLatLng(x, y))

/**
 * The routes of a stuck walk, on the flat map. No hooks: a plain function of
 * the view, so a telemetry frame that changes nothing here redraws nothing.
 */
export const StuckRoutesLayer = memo(function StuckRoutesLayer({ view }: { view: StuckView }) {
  const { episode, routes, focus } = view
  const stuck = episode.stuck
  if (!stuck) return null
  // The focused route is drawn last, so it lies over the others.
  const ordered = [...routes].sort((a, b) => Number(a.id === focus) - Number(b.id === focus))
  return (
    <>
      {stuck.failed_route.length >= 2 && (
        <Polyline
          positions={latLngs(stuck.failed_route)} interactive={false}
          pathOptions={{ color: color.red, weight: 3, dashArray: '2 8', lineCap: 'round', opacity: 0.8 }}
        />
      )}
      {ordered.map((r) => {
        const dim = focus !== null && focus !== r.id
        return r.option.points.length >= 2 && (
          <Polyline
            key={`line-${r.id}`} positions={latLngs(r.option.points)} interactive={false}
            pathOptions={{
              color: ROUTE_COLOUR[r.kind], weight: focus === r.id ? 6 : 4, opacity: dim ? 0.22 : 1,
              dashArray: ROUTE_DASH[r.kind], lineCap: 'round', lineJoin: 'round',
            }}
          />
        )
      })}
      {stuck.back && (
        <CircleMarker
          center={toLatLng(stuck.back.end[0], stuck.back.end[1])} radius={5} interactive={false}
          pathOptions={{ stroke: false, fillColor: color.routeBack, fillOpacity: 1 }}
        />
      )}
      <Marker position={toLatLng(stuck.stuck_at[0], stuck.stuck_at[1])} icon={crossIcon()} interactive={false} keyboard={false} />
      {routes.map((r) => {
        const at = midpointOf(r.option.points)
        if (!at) return null
        const dim = focus !== null && focus !== r.id
        return (
          <Marker
            key={`tag-${r.id}`} position={toLatLng(at[0], at[1])} interactive={false} keyboard={false}
            icon={tagIcon(`${routeTag(r)} ${formatRouteM(r.option.length_m)} m`, ROUTE_COLOUR[r.kind], dim)}
            zIndexOffset={focus === r.id ? 1000 : 0}
          />
        )
      })}
    </>
  )
})

// ── The small drawing in each row ────────────────────────────────────────────

const THUMB_W = 72
const THUMB_H = 46

/** The floor under a stuck walk, painted once for every row's drawing: the
 * same cleaned floor the map shows (buildSceneGrid, through useSceneData's
 * cache), or nothing where there is none (mock mode). */
function useThumbFloor(map: SiteMap | undefined, floor: MapFloor | undefined) {
  const scene = useSceneData(map, floor?.index ?? 0)
  const grid = scene.status === 'ready' && scene.data ? scene.data.grid : null
  return usePaintedFloorUrl(grid, false)
}

type Box = ReturnType<typeof stuckBox>

/**
 * One route, drawn small: the floor cropped to every route's box (the same box
 * for every row, so they read as the same place), the route in its colour,
 * the robot and the goal. SVG y runs down, so map y is negated.
 */
export function RouteThumb({ route, box, robotAt, goal, floorImage }: {
  route: StuckRoute
  box: Box
  robotAt: Point2D
  goal: { x_m: number; y_m: number } | null
  floorImage: PaintedFloor | null
}) {
  const w = box.maxX - box.minX, h = box.maxY - box.minY
  const dot = Math.max(w, h) * 0.05
  const points = route.option.points.map(([x, y]) => `${x},${-y}`).join(' ')
  const [y0, x0] = floorImage?.bounds[0] ?? [0, 0]
  const [y1, x1] = floorImage?.bounds[1] ?? [0, 0]
  return (
    <svg
      width={THUMB_W} height={THUMB_H} viewBox={`${box.minX} ${-box.maxY} ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
      aria-hidden data-route-thumb={route.id}
      style={{ gridRow: '1 / 3', borderRadius: radius.sm, background: color.sceneFloor, display: 'block', flexShrink: 0 }}
    >
      {floorImage && (
        <image
          href={floorImage.url} x={x0} y={-y1} width={x1 - x0} height={y1 - y0} preserveAspectRatio="none"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <polyline
        points={points} fill="none" stroke={ROUTE_COLOUR[route.kind]} strokeWidth={3} vectorEffect="non-scaling-stroke"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.kind === 'back' ? '5 4' : undefined}
      />
      <circle cx={robotAt[0]} cy={-robotAt[1]} r={dot} fill={color.accent} />
      {goal && <circle cx={goal.x_m} cy={-goal.y_m} r={dot * 1.1} fill={color.red} />}
    </svg>
  )
}

// ── State and the answer ─────────────────────────────────────────────────────

/** A countdown that re-renders four times a second while it runs. */
function useNow(on: boolean): number {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!on) return
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [on])
  return Date.now()
}

/**
 * The stuck walk on screen for one robot, if any -- live, or ended from there
 * and kept until closed -- with the route picked (the shortest at first) and
 * the one pointed at, and the answer. `on` false (the inset, no survey) shows
 * none.
 */
export function useNavStuck(robot: RobotState, on: boolean) {
  const { t } = useTranslation()
  const dispatchCommandAsync = useLiveOpsStore((s) => s.dispatchCommandAsync)
  // Read once per /state: `nav_goal` keeps its identity between telemetry
  // frames, so the routes, the map's lines and the scene's are not rebuilt.
  const rawGoal = robot.nav_goal
  const goal = useMemo(() => (on ? readNavGoal(rawGoal) : null), [on, rawGoal])

  // Tracked during render, as NavGoalLayer tracks finished goals.
  const [track, setTrack] = useState(() => initialStuckTrack(robot.robot_id, goal, Date.now()))
  const next = nextStuckTrack(track, robot.robot_id, goal, Date.now())
  if (next !== track) setTrack(next)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const raw = stuckEpisodeOf(next, goal)
  const episodeKey = raw ? `${raw.goal.goal_id}/${raw.mode}/${raw.stuck?.since ?? ''}` : null
  const episode = raw && !(raw.mode === 'ended' && dismissed === episodeKey) ? raw : null

  const stuck = episode?.stuck ?? null
  // One list per stuck status, not per telemetry frame.
  const routes = useMemo(() => (stuck ? stuckRoutes(stuck) : []), [stuck])

  // Picked: the operator's click, else the shortest. Pointed at: hover or focus.
  const [picked, setPicked] = useState<{ key: string; id: string } | null>(null)
  const [pointed, setPointed] = useState<string | null>(null)
  const pickedId = picked && picked.key === episodeKey && routes.some((r) => r.id === picked.id) ? picked.id : defaultRouteId(routes)
  const focus = pointed && routes.some((r) => r.id === pointed) ? pointed : pickedId

  const [sending, setSending] = useState<{ key: string; choice: NavResolveChoice } | null>(null)
  const [error, setError] = useState<{ key: string; text: string } | null>(null)
  const sent = useRef(0)

  const latest = useRef({ robotId: robot.robot_id, episode })
  useEffect(() => { latest.current = { robotId: robot.robot_id, episode } })

  const answer = useCallback((choice: NavResolveChoice, optionId: string | null = null) => {
    const { robotId, episode: ep } = latest.current
    if (!ep || ep.mode !== 'live' || !episodeKey) return
    const seq = ++sent.current
    setSending({ key: episodeKey, choice })
    setError(null)
    void dispatchCommandAsync(robotId, 'NAV_RESOLVE', t('liveops.nav.stuck.resolveCommand'), {
      ...navResolveParams(ep.goal.goal_id, choice, optionId),
    }).then(({ result, command }) => {
      if (seq !== sent.current) return
      setSending(null)
      if (result === 'failed' || result === 'unknown') {
        const why = command.failure_reason ? refusalText(t, command.failure_reason) : t('command.refusal.unknown')
        setError({ key: episodeKey, text: t('liveops.nav.stuck.failed', { reason: why }) })
      }
    })
  }, [dispatchCommandAsync, episodeKey, t])

  const view: StuckView | null = useMemo(
    () => (episode ? { episode, routes, focus } : null),
    // `episode` is rebuilt every frame; what the map draws changes with these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [episodeKey, stuck, routes, focus],
  )

  return {
    view,
    pickedId,
    point: setPointed,
    pick: useCallback((id: string) => { if (episodeKey) setPicked({ key: episodeKey, id }) }, [episodeKey]),
    answer,
    dismiss: useCallback(() => setDismissed(episodeKey), [episodeKey]),
    sending: sending && sending.key === episodeKey ? sending.choice : null,
    error: error && error.key === episodeKey ? error.text : null,
  }
}

export type NavStuckState = ReturnType<typeof useNavStuck>

// ── The card ─────────────────────────────────────────────────────────────────

function Dot({ c, size = 8 }: { c: string; size?: number }) {
  return <span aria-hidden style={{ width: size, height: size, borderRadius: radius.full, background: c, flexShrink: 0 }} />
}

const ACTION: React.CSSProperties = { height: 34, padding: `0 ${space[3]}px`, border: 'none', fontWeight: font.weight.bold }

/**
 * The card in the walk bar's place while a walk is stuck: why; one row per
 * route, each with its drawing, length and time, the shortest marked; then
 * Go via <route>, Try again and Cancel; the minute the robot waits; and the
 * caption. Pointing at a row makes its line bold on the map; clicking it picks
 * it. Only someone who may answer gets the buttons (stuckAnswerable); anyone
 * else sees who holds control. After the walk ended from here, the card says
 * why and keeps the routes, read only, until it is closed.
 */
export function NavStuckCard({ robot, map, floor, state }: {
  robot: RobotState
  map: SiteMap | undefined
  floor: MapFloor | undefined
  state: NavStuckState
}) {
  const { t } = useTranslation()
  const { view, pickedId, point, pick, answer, dismiss, sending, error } = state
  const live = view?.episode.mode === 'live'
  const stuck = view?.episode.stuck ?? null
  const now = useNow(live && !!stuck?.decide_by)
  const floorImage = useThumbFloor(map, floor)
  useControlHolderNames([robot.control_owner])
  if (!view) return null
  const { episode, routes } = view
  const goal = { x_m: episode.goal.x_m, y_m: episode.goal.y_m }
  const box = stuck ? stuckBox(stuck, goal) : null
  const picked = routes.find((r) => r.id === pickedId) ?? null

  const who = stuckAnswerable(robot)
  const policy = getCommandAvailability(robot, 'NAV_RESOLVE')
  const canAnswer = live && who.ok
  const fraction = live && stuck ? stuckFractionLeft(stuck, episode.firstSeenAt, now) : null
  const deadline = live && stuck ? stuckDeadlineMs(stuck, episode.firstSeenAt) : null
  const outcome = episode.mode === 'ended' ? navGoalOutcome(episode.goal) : null

  return (
    <div role="group" aria-label={t(live ? 'liveops.nav.stuck.title' : 'liveops.nav.stuck.endedTitle')} data-nav-stuck={episode.mode}
      style={{ display: 'flex', flexDirection: 'column', gap: space[2], wordBreak: 'keep-all', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <Dot c={live ? color.amber : color.red} />
        <span style={{ flex: 1, fontSize: font.size.lg, fontWeight: font.weight.bold, letterSpacing: font.tracking.tight }}>
          {t(live ? 'liveops.nav.stuck.title' : 'liveops.nav.stuck.endedTitle')}
        </span>
        {!live && (
          <Button variant="ghost" size="sm" onClick={dismiss} style={{ border: 'none', background: color.selected }}>
            {t('liveops.nav.stuck.dismiss')}
          </Button>
        )}
      </div>
      <div style={{ fontSize: font.size.sm, lineHeight: 1.45, color: color.t2 }}>
        {live ? stuckReasonText(stuck?.reason ?? '') : outcome?.text}
        {!live && routes.length > 0 && <> {t('liveops.nav.stuck.endedRoutes')}</>}
      </div>

      {stuck && stuck.routes.length === 0 && (
        <div style={{ fontSize: font.size.sm, color: color.t2 }}>{t('liveops.nav.stuck.noRoutes')}</div>
      )}
      {routes.length > 0 && box && (
        <div role="group" aria-label={t('liveops.nav.stuck.routesAria')} style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {routes.map((r) => {
            const note = routeNote(r, goal)
            return (
              <button
                key={r.id} type="button" className="rh-stuck-row" aria-pressed={r.id === pickedId} data-route={r.id}
                onClick={() => pick(r.id)}
                onMouseEnter={() => point(r.id)} onMouseLeave={() => point(null)}
                onFocus={() => point(r.id)} onBlur={() => point(null)}
              >
                <RouteThumb route={r} box={box} robotAt={stuck!.stuck_at} goal={r.kind === 'back' ? null : goal} floorImage={floorImage} />
                <span style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0, fontWeight: font.weight.bold }}>
                  <Dot c={ROUTE_COLOUR[r.kind]} size={7} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{routeName(r)}</span>
                  {r.shortest && (
                    <span style={{
                      flexShrink: 0, fontSize: font.size['2xs'], fontWeight: font.weight.bold, color: color.green,
                      background: color.greenBg, borderRadius: radius.xs, padding: '1px 6px',
                    }}>
                      {t('liveops.nav.stuck.shortest')}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatRouteM(r.option.length_m)} m{r.option.est_s !== null && r.kind !== 'back' ? ` · ${formatEstimate(r.option.est_s)}` : ''}
                </span>
                <span style={{ gridColumn: '2 / 4', fontSize: font.size.xs, color: color.t3, minHeight: 14 }}>{note ?? ''}</span>
              </button>
            )
          })}
        </div>
      )}

      {live && (canAnswer ? (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          {picked && (
            <Button
              variant="primary" onClick={() => answer('route', picked.id)}
              disabled={sending !== null || !policy.enabled} title={policy.enabled ? undefined : policy.reason}
              style={ACTION}
            >
              {sending === 'route' ? t('liveops.nav.stuck.sending') : goLabel(picked)}
            </Button>
          )}
          <Button
            variant="ghost" onClick={() => answer('retry')} disabled={sending !== null || !policy.enabled}
            title={policy.enabled ? undefined : policy.reason} style={{ ...ACTION, background: color.selected, color: color.t1 }}
          >
            {sending === 'retry' ? t('liveops.nav.stuck.sending') : t('liveops.nav.stuck.retry')}
          </Button>
          <Button
            variant="ghost" onClick={() => answer('cancel')} disabled={sending !== null}
            style={{ ...ACTION, background: color.selected, color: color.t1 }}
          >
            {sending === 'cancel' ? t('liveops.nav.stuck.sending') : t('liveops.nav.stuck.cancel')}
          </Button>
        </div>
      ) : (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
          <Dot c={color.t3} size={6} />
          {!who.ok && who.owner.startsWith('mission:')
            ? t('liveops.nav.stuck.readOnlyMission')
            : t('liveops.nav.stuck.readOnly', { owner: who.ok ? '' : controlHolderName(who.owner) })}
        </div>
      ))}
      {error && (
        <div role="alert" style={{
          fontSize: font.size.sm, color: color.red, background: color.redBg, borderRadius: radius.sm, padding: `${space[1]}px ${space[2]}px`,
        }}>
          {error}
        </div>
      )}
      {fraction !== null && (
        <div
          role="progressbar" aria-valuemin={0} aria-valuemax={60} aria-label={t('liveops.nav.stuck.caption')}
          aria-valuenow={deadline === null ? undefined : Math.max(0, Math.round((deadline - now) / 1000))}
          style={{ height: 4, borderRadius: 2, background: color.selected, overflow: 'hidden' }}
        >
          <i style={{ display: 'block', height: '100%', width: `${fraction * 100}%`, background: color.amber, transition: 'width 250ms linear' }} />
        </div>
      )}
      {live && (
        <div style={{ fontSize: font.size.xs, color: color.t3 }}>
          {t(stuck?.decide_by ? 'liveops.nav.stuck.caption' : 'liveops.nav.stuck.captionNoDeadline')}
        </div>
      )}
    </div>
  )
}

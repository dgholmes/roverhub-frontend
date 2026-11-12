import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Crosshair, Expand, Minimize, Play, RotateCcw, Square } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { keyHints } from '@/scene3d/engine/input'
import { minimapFrame, minimapSize } from '@/scene3d/engine/minimap'
import { SceneEngine, type PointDetail, type SceneEngineStatus, type SceneLayers, type SceneToast } from '@/scene3d/engine/SceneEngine'
import type { CloudColouring, SceneRouteWaypoint, SceneView, SceneZone } from '@/scene3d/types'
import type { MapSceneProps } from './mapSceneProps'

export type { MapSceneProps } from './mapSceneProps'

const EMPTY_ROUTE: SceneRouteWaypoint[] = []
const EMPTY_ZONES: SceneZone[] = []
const TOAST_MS = 2400

/** The page's glass: the overlay tint and blur, no outline (house rule: tints,
 * not hairlines). */
const glassStyle: React.CSSProperties = {
  background: 'var(--rh-overlay)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderRadius: radius.md,
  boxShadow: 'var(--rh-shadow-md)',
}

const overlayBox: React.CSSProperties = {
  position: 'absolute', zIndex: 2, display: 'flex', gap: space[2], pointerEvents: 'none',
}

const auto: React.CSSProperties = { pointerEvents: 'auto' }

function gbtn(pressed: boolean): React.CSSProperties {
  return {
    border: 'none', borderRadius: radius.sm, padding: '4px 12px', fontSize: font.size.sm, fontWeight: font.weight.semibold,
    fontFamily: font.family, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: pressed ? color.accentSolid : 'transparent', color: pressed ? color.accentText : color.t1,
  }
}

function Tog({ on, label, onClick, title, disabled = false, dot = true }: {
  on: boolean; label: string; onClick: () => void; title?: string; disabled?: boolean; dot?: boolean
}) {
  return (
    <button
      type="button" aria-pressed={on} title={title} disabled={disabled} onClick={onClick}
      style={{
        border: 'none', borderRadius: radius.sm, padding: '4px 10px', fontSize: font.size.sm, fontWeight: font.weight.medium,
        fontFamily: font.family, display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        background: on ? color.accentDim : color.hover, color: on ? color.t1 : color.t2,
      }}
    >
      {dot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: on ? color.accent : color.t3 }} />}
      {label}
    </button>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: font.size['2xs'], fontWeight: font.weight.bold, letterSpacing: font.tracking.widest,
      textTransform: 'uppercase', color: color.t3, marginRight: 4,
    }}>{children}</span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      fontFamily: font.family, fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t1,
      background: color.selected, borderRadius: radius.xs, padding: '0 4px', minWidth: 18, display: 'inline-block', textAlign: 'center',
    }}>{children}</kbd>
  )
}

function isCoarse(): boolean {
  try { return matchMedia('(pointer: coarse)').matches } catch { return false }
}

/**
 * The map scene: Plan, Fly and Follow over one floor, ported from the map
 * options page. A thin React shell around `SceneEngine` -- the engine owns
 * the canvas, the input and the per-frame work; this owns the toolbar, the
 * key hints, the minimap and inset boxes, and turns props into engine calls.
 * Nothing here re-renders per frame.
 *
 * Import through MapSceneLazy: this module carries three.js.
 */
export function MapScene(props: MapSceneProps) {
  const {
    data, views, followTarget, route = EMPTY_ROUTE, selectedWaypointId = null, robot = null, goal = null,
    goalLine = false, poseDraft = null, zones = EMPTY_ZONES, scan = null, pointerMode, overlay, frameKey,
    showViewSwitch = true, className, style,
  } = props
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const pipRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const barTextRef = useRef<HTMLSpanElement>(null)
  const [engine, setEngine] = useState<SceneEngine | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [status, setStatus] = useState<SceneEngineStatus>({ detached: false, hasRobot: false, previewing: false })
  const [layers, setLayers] = useState<SceneLayers>({ walkable: true, furniture: true, points: false, ceiling: false, pip: true })
  const [colouring, setColouring] = useState<CloudColouring>('structure')
  const [coarse] = useState(isCoarse)
  const [detail, setDetail] = useState<PointDetail>(coarse ? 0.5 : 1)
  const [tiltLocal, setTiltLocal] = useState(false)
  const [focused, setFocused] = useState(false)
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null)
  const [keysOpen, setKeysOpen] = useState(props.keyHelpOpen ?? true)
  const [narrow, setNarrow] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const hasCloud = !!data.cloud && data.cloud.count > 0
  const view: SceneView = hasCloud ? props.view : 'plan'
  const tilted = props.tilted ?? tiltLocal

  // The engine's callbacks read the latest props through this, so they are
  // set once per engine and never go stale.
  const latest = useRef(props)
  latest.current = props

  const requestTilt = useCallback((on: boolean) => {
    if (latest.current.tilted === undefined) setTiltLocal(on)
    latest.current.onTiltChange?.(on)
  }, [])

  const showToast = (key: SceneToast | 'fullscreenUnavailable') => {
    setToast((prev) => ({ text: t(`scene.toast.${key}`), n: (prev?.n ?? 0) + 1 }))
  }
  const toastRef = useRef(showToast)
  toastRef.current = showToast

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [toast])

  // One engine per floor's data.
  useEffect(() => {
    const host = hostRef.current, labels = labelsRef.current
    if (!host || !labels) return
    const eng = SceneEngine.create(host, labels, data)
    if (!eng) { setWebgl(false); return }
    setWebgl(true)
    eng.setCallbacks({
      onFloorTap: (x, y) => latest.current.onFloorTap?.(x, y),
      onFloorPoseDown: (x, y) => latest.current.onFloorPoseDown?.(x, y),
      onFloorPoseMove: (x, y) => latest.current.onFloorPoseMove?.(x, y),
      onFloorPoseUp: (x, y) => latest.current.onFloorPoseUp?.(x, y),
      onWaypointClick: (id) => latest.current.onWaypointClick?.(id),
      onStandinWaypoint: (x, y) => latest.current.onStandinWaypoint?.(x, y),
      onTiltRequest: requestTilt,
      onStatus: setStatus,
      onToast: (key) => toastRef.current(key),
    })
    setStatus(eng.getStatus())
    setEngine(eng)
    return () => {
      eng.dispose()
      setEngine(null)
    }
  }, [data, requestTilt])

  // Props into the engine. Order matters where one setter reads another's
  // state: the route before a re-frame.
  useEffect(() => { engine?.setFollowTarget(followTarget) }, [engine, followTarget])
  useEffect(() => { engine?.setView(view) }, [engine, view])
  useEffect(() => { engine?.setTilted(tilted) }, [engine, tilted])
  useEffect(() => { engine?.setLayers(layers) }, [engine, layers])
  useEffect(() => { engine?.setColouring(colouring) }, [engine, colouring])
  useEffect(() => { engine?.setDetail(detail) }, [engine, detail])
  useEffect(() => { engine?.setPointerMode(pointerMode) }, [engine, pointerMode])
  useEffect(() => { engine?.setRoute(route, selectedWaypointId) }, [engine, route, selectedWaypointId])
  useEffect(() => { engine?.setRobot(robot) }, [engine, robot])
  useEffect(() => { engine?.setGoal(goal, goalLine) }, [engine, goal, goalLine])
  useEffect(() => { engine?.setPoseDraft(poseDraft) }, [engine, poseDraft])
  useEffect(() => { engine?.setZones(zones) }, [engine, zones])
  useEffect(() => { engine?.setScan(scan) }, [engine, scan])
  useEffect(() => { if (frameKey !== undefined) engine?.frame() }, [engine, frameKey])

  const showMinimap = view === 'fly'
  const showPip = view === 'follow' && followTarget === 'standin' && layers.pip
  const showScale = view === 'plan' && !tilted
  useEffect(() => { engine?.setMinimapCanvas(showMinimap ? minimapRef.current : null) }, [engine, showMinimap])
  useEffect(() => { engine?.setPipElement(showPip ? pipRef.current : null) }, [engine, showPip])
  useEffect(() => { engine?.setScaleBar(showScale ? barRef.current : null, showScale ? barTextRef.current : null) }, [engine, showScale])

  // Width-driven bits: the touch pad under 720 px, keys folded under 900 px
  // on first measure.
  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    let first = true
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      if (!w) return
      setNarrow(w < 720)
      if (first) { first = false; if (w < 900) setKeysOpen(false) }
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === hostRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    const host = hostRef.current
    if (!host) return
    const p = document.fullscreenElement ? document.exitFullscreen() : host.requestFullscreen?.()
    if (!p) { showToast('fullscreenUnavailable'); return }
    p.catch(() => showToast('fullscreenUnavailable'))
  }

  const mmBox = useMemo(() => minimapSize(minimapFrame(data.grid)), [data])
  const hints = useMemo(() => keyHints(view, { followTarget, pointerMode, touch: coarse }), [view, followTarget, pointerMode, coarse])
  const toggleLayer = (key: keyof SceneLayers) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  const robotFollow = view === 'follow' && followTarget === 'robot'
  const edge = {
    top: 12 + (props.insets?.top ?? 0), left: 12 + (props.insets?.left ?? 0),
    right: 12 + (props.insets?.right ?? 0), bottom: 12 + (props.insets?.bottom ?? 0),
  }
  const fullscreenOffered = props.allowFullscreen !== false
  // The host can put the scene's controls away (LiveOps' map tools button).
  const chrome: React.CSSProperties = props.showControls === false ? { display: 'none' } : {}
  const sub = view === 'plan' ? (tilted ? t('scene.sub.tilted') : t('scene.sub.flat'))
    : view === 'fly' ? (colouring === 'height' ? t('scene.sub.byHeight') : t('scene.sub.byStructure'))
      : followTarget === 'standin' ? t('scene.sub.walkableOnly')
        : status.detached ? t('scene.sub.freeCamera') : t('scene.sub.followingRobot')
  const pointsShown = hasCloud && (view !== 'plan' || layers.points)
  const cloudCount = data.cloud?.count ?? 0
  const showPad = coarse || narrow

  if (!webgl) {
    return (
      <div className={className} style={{
        position: 'relative', background: color.sceneBg, color: color.t2, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: space[6], textAlign: 'center', fontFamily: font.family, fontSize: font.size.md, ...style,
      }} role="status">
        {t('scene.noWebgl')}
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className={className}
      tabIndex={0}
      role="application"
      aria-label={t('scene.sceneAria')}
      data-testid="map-scene"
      onFocus={(e) => { if (e.target === e.currentTarget) setFocused(true) }}
      onBlur={(e) => { if (e.target === e.currentTarget) setFocused(false) }}
      style={{
        position: 'relative', overflow: 'hidden', background: color.sceneBg, touchAction: 'none', outline: 'none',
        fontFamily: font.family, color: color.t1, boxShadow: focused ? 'inset 0 0 0 2px var(--rh-accent-border)' : undefined,
        ...style,
      }}
    >
      <div ref={labelsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }} />

      {/* top-left: views, mode, layers */}
      <div data-scene-ui style={{ ...overlayBox, ...chrome, top: edge.top, left: edge.left, flexDirection: 'column', alignItems: 'flex-start',
        // Clear of the top-right column (view buttons, minimap: about 220 px),
        // but never narrower than the toolbar's widest chip row: on a narrow
        // map it squeezed into a column of single letters.
        maxWidth: `max(260px, calc(100% - ${edge.left + edge.right + 232}px))` }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          {showViewSwitch && (
            <div role="group" aria-label={t('scene.viewSwitchAria')} style={{ ...glassStyle, ...auto, display: 'flex', gap: 4, padding: 4 }}>
              {views.map((v) => {
                const disabled = v !== 'plan' && !hasCloud
                return (
                  <button
                    key={v} type="button" data-view={v} aria-pressed={view === v} disabled={disabled}
                    title={disabled ? t('scene.needsCloud') : undefined}
                    onClick={() => props.onViewChange(v)}
                    style={{ ...gbtn(view === v), ...(disabled ? { cursor: 'not-allowed', opacity: 0.45 } : null) }}
                  >
                    {t(`scene.views.${v}`)}
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ ...glassStyle, ...auto, padding: '4px 12px', fontSize: font.size.sm, fontWeight: font.weight.bold, display: 'inline-flex', gap: 8 }}>
            {t(`scene.views.${view}`)}
            <span style={{ color: color.t2, fontWeight: font.weight.regular }}>{sub}</span>
          </div>
        </div>

        <div data-testid="scene-toolbar" style={{ ...glassStyle, ...auto, display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '6px 10px' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <GroupLabel>{t('scene.show')}</GroupLabel>
            {data.hasPlanning && <Tog on={layers.walkable} label={t('scene.layer.walkable')} onClick={() => toggleLayer('walkable')} />}
            {view === 'plan' && data.hasPlanning && <Tog on={layers.furniture} label={t('scene.layer.furniture')} onClick={() => toggleLayer('furniture')} />}
            {view === 'plan' && hasCloud && <Tog on={layers.points} label={t('scene.layer.points')} onClick={() => toggleLayer('points')} />}
            {view !== 'plan' && <Tog on={layers.ceiling} label={t('scene.layer.ceiling')} onClick={() => toggleLayer('ceiling')} />}
            {view === 'follow' && followTarget === 'standin' && <Tog on={layers.pip} label={t('scene.layer.pip')} onClick={() => toggleLayer('pip')} />}
          </div>
          {view === 'fly' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <GroupLabel>{t('scene.colour')}</GroupLabel>
              <Tog on={colouring === 'structure'} label={t('scene.colourStructure')} onClick={() => setColouring('structure')} />
              <Tog on={colouring === 'height'} label={t('scene.colourHeight')} onClick={() => setColouring('height')} />
              <Tog on={false} disabled label={t('scene.colourCamera')} title={t('scene.colourCameraTitle')} onClick={() => {}} />
            </div>
          )}
          {pointsShown && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <GroupLabel>{t('scene.points')}</GroupLabel>
              {([[1, 'all'], [0.5, 'half'], [0.25, 'quarter']] as const).map(([v, key]) => (
                <Tog
                  key={key} on={detail === v} label={t(`scene.detail.${key}`)} onClick={() => setDetail(v)}
                  title={t('scene.detailTitle', { n: Math.round(cloudCount * v).toLocaleString() })}
                />
              ))}
            </div>
          )}
        </div>

        {!focused && !coarse && (
          <div style={{ ...glassStyle, ...auto, padding: '4px 12px', fontSize: font.size.xs, color: color.t2 }}>{t('scene.focusHint')}</div>
        )}
      </div>

      {/* top-right: host controls, view buttons, minimap, inset */}
      <div data-scene-ui style={{ ...overlayBox, ...chrome, top: edge.top, right: edge.right, flexDirection: 'column', alignItems: 'flex-end' }}>
        {overlay && <div style={{ ...auto }}>{overlay}</div>}
        <div style={{ ...glassStyle, ...auto, display: 'flex', gap: 4, padding: 4 }}>
          {view === 'plan' && (
            <button type="button" aria-pressed={tilted} title={t('scene.tiltTitle')} onClick={() => requestTilt(!tilted)} style={gbtn(tilted)}>
              <Box size={14} strokeWidth={1.75} aria-hidden />{t('scene.tilt')}
            </button>
          )}
          {robotFollow && status.detached && status.hasRobot && (
            <button type="button" title={t('scene.backToRobotTitle')} onClick={() => engine?.reattach()} style={gbtn(true)}>
              <Crosshair size={14} strokeWidth={1.75} aria-hidden />{t('scene.backToRobot')}
            </button>
          )}
          <button type="button" onClick={() => engine?.resetView()} style={gbtn(false)}>
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden />{t('scene.resetView')}
          </button>
          {!narrow && fullscreenOffered && (
            <button type="button" onClick={toggleFullscreen} style={gbtn(false)}>
              {fullscreen ? <Minimize size={14} strokeWidth={1.75} aria-hidden /> : <Expand size={14} strokeWidth={1.75} aria-hidden />}
              {fullscreen ? t('scene.exitFullscreen') : t('scene.fullscreen')}
            </button>
          )}
        </div>
        {robotFollow && !status.hasRobot && (
          <div role="status" style={{ ...glassStyle, ...auto, padding: '4px 12px', fontSize: font.size.sm, color: color.t2, maxWidth: 260 }}>
            {t('scene.noRobot')}
          </div>
        )}
        {showMinimap && (
          <div style={{ ...glassStyle, ...auto, padding: 4 }}>
            <canvas
              ref={minimapRef}
              aria-label={t('scene.minimapAria')}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                if (r.width && r.height) engine?.minimapJump((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
              }}
              style={{
                display: 'block', width: Math.round(mmBox.w / 2 * (narrow ? 120 / 168 : 1)),
                height: Math.round(mmBox.h / 2 * (narrow ? 120 / 168 : 1)), borderRadius: radius.sm, cursor: 'crosshair',
              }}
            />
            <div style={{ fontSize: font.size['2xs'], color: color.t2, padding: '2px 4px 0' }}>{t('scene.minimapCaption')}</div>
          </div>
        )}
        {showPip && (
          <div
            ref={pipRef}
            data-testid="scene-pip"
            style={{
              ...auto, width: narrow ? '44vw' : 'min(34vw, 300px)', aspectRatio: '16 / 10', position: 'relative',
              borderRadius: radius.md, boxShadow: '0 0 0 2px var(--rh-overlay)',
            }}
          >
            <span style={{ ...glassStyle, position: 'absolute', left: 8, bottom: 8, fontSize: font.size.xs, padding: '2px 8px' }}>
              {t('scene.pip')}
            </span>
          </div>
        )}
      </div>

      {/* bottom-left: keys */}
      <div data-scene-ui style={{ ...overlayBox, ...chrome, bottom: edge.bottom, left: edge.left }}>
        <details
          open={keysOpen}
          onToggle={(e) => setKeysOpen((e.currentTarget as HTMLDetailsElement).open)}
          style={{ ...glassStyle, ...auto, padding: '8px 12px', fontSize: font.size.sm, color: color.t2, maxWidth: narrow ? 220 : 300 }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: font.weight.bold, color: color.t1 }}>{t('scene.keysTitle')}</summary>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '8px 0 0' }}>
            {hints.map((h, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt style={{ whiteSpace: 'nowrap', display: 'flex', gap: 3 }}>{h.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dt>
                <dd style={{ margin: 0 }}>{t(`scene.keys.${h.label}`)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      {/* bottom-centre: scale bar (top-down plan) or Preview (stand-in) */}
      <div data-scene-ui style={{ ...overlayBox, bottom: edge.bottom, left: '50%', transform: 'translateX(-50%)' }}>
        {showScale && (
          <div style={{
            ...glassStyle, padding: '4px 8px', fontSize: font.size.xs, color: color.t2, display: 'flex',
            flexDirection: 'column', gap: 2, alignItems: 'flex-start', fontVariantNumeric: 'tabular-nums',
          }}>
            <i ref={barRef} style={{ display: 'block', height: 4, width: 80, background: color.t1, borderRadius: 2 }} />
            <span ref={barTextRef}>5 m</span>
          </div>
        )}
        {view === 'follow' && followTarget === 'standin' && (
          <button
            type="button" disabled={route.length < 2} onClick={() => engine?.togglePreview()}
            style={{
              ...auto, border: 'none', borderRadius: radius.md, padding: '6px 14px', fontSize: font.size.sm,
              fontWeight: font.weight.bold, fontFamily: font.family, display: 'inline-flex', alignItems: 'center', gap: 6,
              background: color.accentSolid, color: color.accentText, boxShadow: 'var(--rh-shadow-md)',
              cursor: route.length < 2 ? 'not-allowed' : 'pointer', opacity: route.length < 2 ? 0.55 : 1,
            }}
          >
            {status.previewing ? <Square size={12} strokeWidth={2} aria-hidden /> : <Play size={12} strokeWidth={2} aria-hidden />}
            {status.previewing ? t('scene.stopPreview') : t('scene.preview')}
          </button>
        )}
      </div>

      {/* bottom-right: the touch pad */}
      {showPad && (
        <div data-scene-ui style={{ ...overlayBox, ...chrome, bottom: edge.bottom, right: edge.right, alignItems: 'flex-end' }}>
          <TouchPad
            side={view === 'fly' ? 'updown' : view === 'follow' && followTarget === 'standin' ? 'drop' : null}
            onPress={(k) => engine?.pressKey(k)}
            onRelease={(k) => engine?.releaseKey(k)}
            onDrop={() => engine?.dropHere()}
          />
        </div>
      )}

      {toast && (
        <div
          role="status" key={toast.n}
          style={{
            ...glassStyle, position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
            padding: '8px 16px', fontSize: font.size.md, fontWeight: font.weight.medium, pointerEvents: 'none',
            whiteSpace: narrow ? 'normal' : 'nowrap', width: narrow ? '80%' : undefined, textAlign: 'center',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

/** The page's on-screen pad: arrows that hold their key while pressed, plus
 * Up/Down in Fly or Drop in Follow. */
function TouchPad({ side, onPress, onRelease, onDrop }: {
  side: 'updown' | 'drop' | null
  onPress: (key: string) => void
  onRelease: (key: string) => void
  onDrop: () => void
}) {
  const { t } = useTranslation()
  const [held, setHeld] = useState<string | null>(null)
  const btn = (key: string, label: string, aria: string, wide = false) => (
    <button
      type="button" aria-label={aria}
      onPointerDown={(e) => {
        e.preventDefault()
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
        setHeld(key)
        if (key === 'drop') onDrop()
        else onPress(key)
      }}
      onPointerUp={() => { setHeld(null); if (key !== 'drop') onRelease(key) }}
      onPointerCancel={() => { setHeld(null); if (key !== 'drop') onRelease(key) }}
      style={{
        border: 'none', borderRadius: radius.md, width: wide ? 'auto' : 44, height: 44, padding: wide ? '0 12px' : 0,
        fontSize: wide ? font.size.sm : 16, fontWeight: font.weight.bold, fontFamily: font.family, touchAction: 'none',
        userSelect: 'none', cursor: 'pointer',
        background: held === key ? color.accentSolid : color.selected, color: held === key ? color.accentText : color.t1,
      }}
    >{label}</button>
  )
  return (
    <div style={{ ...glassStyle, ...auto, display: 'flex', gap: 4, padding: 8, alignItems: 'flex-end' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gridTemplateRows: 'repeat(2, 44px)', gap: 4 }}>
        <span />{btn('ArrowUp', '▲', t('scene.pad.forward'))}<span />
        {btn('ArrowLeft', '◀', t('scene.pad.left'))}
        {btn('ArrowDown', '▼', t('scene.pad.back'))}
        {btn('ArrowRight', '▶', t('scene.pad.right'))}
      </div>
      {side && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {side === 'updown'
            ? <>{btn('up', t('scene.pad.up'), t('scene.pad.up'), true)}{btn('dn', t('scene.pad.down'), t('scene.pad.down'), true)}</>
            : btn('drop', t('scene.pad.drop'), t('scene.pad.drop'), true)}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SwitchCamera } from 'lucide-react'
import { hashForSiteRun } from '@/app/routes'
import { Badge, Button, IconButton } from '@/components/kit'
import { CameraFeedLayer } from '@/components/liveops/hero/CameraFeedLayer'
import { CaptureRail } from '@/components/liveops/hero/CaptureRail'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import type { FitPadding } from '@/components/liveops/map/FitToSite'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { color, font, radius, space } from '@/design-system/tokens'
import type { Orientation } from '@/lib/touchShell'
import type { RobotRunView } from '@/liveops/robotRun'
import { formatClock, taskBarModel } from '@/liveops/taskBar'
import { useSiteMap } from '@/liveops/useSiteMap'
import { useSessionStore } from '@/store/useSessionStore'
import type { Mission, RobotState } from '@/types'
import { paneStyle, watchPanes, type Rect } from './touchLayout'

/**
 * Watching a robot on a handheld: two panes, three on a tablet in landscape,
 * and nothing between them.
 *
 * The complaint this answers is a map that was small, pushed to one side and
 * ringed with chrome. So the body is tiled by exactly the rectangles
 * `touchLayout.ts` returns -- two, or three where a tablet's left column
 * splits into map over second camera -- and **each pane fills its rect edge to
 * edge**. Everything a pane needs floats *over* its own picture: the map keeps
 * tap-to-walk's `NavTools` (drawn by `MapCanvas` itself) and carries the run
 * card in its bottom-left corner; the camera carries the capture rail and the
 * front/rear switch; the second camera carries its own label and a swap that
 * covers the tile. Nothing else is in any of them.
 *
 * The leaves are the desktop's leaves. `MapCanvas` fills its pane and draws
 * the surveyed floor (Task 6), `FitToSite` clamps the padding it is given
 * (Task 5), and this file declares a near-zero padding because it floats
 * nothing over the map that the fit must avoid -- the run card sits in the
 * corner the fit already leaves.
 *
 * ⚠️ **The body measures itself.** `TouchLiveOps` passes the strip and dock
 * heights because it owns those constants, but not the body's own size: the
 * body is a flex child and only the browser knows what the flexbox gave it.
 * Hence the `ResizeObserver` below, guarded so importing this module in the
 * `node` test environment cannot throw.
 */

export interface TouchBodyProps {
  siteId: string
  robot: RobotState
  mission?: Mission
  run: RobotRunView
  orientation: Orientation
  big: boolean
  /** Height of the top strip, 0 while immersive. */
  barH: number
  /** Height of the dock. It never collapses, so this is never 0. */
  dockH: number
  /** Dismisses an ended run — the run card's own control. */
  onDismissRun?: () => void
}

/** Near zero: this shell floats nothing over the map that the fit has to
 * avoid, so the floor gets the pane. Not *actually* zero, so the floorplan's
 * own edge is not flush against the pane's. */
const TOUCH_FIT_PADDING: FitPadding = { topLeft: [8, 8], bottomRight: [8, 8] }

/**
 * Where the map's tool group goes in PORTRAIT: over the camera, at the top of
 * the screen, instead of over the map (operator, 2026-11-25).
 *
 * Measured at 390 x 844: the map pane is 339 px tall and the group plus its
 * hint lines take 85 off the top of it -- a quarter of the floorplan, and the
 * quarter nearest the robot. The camera above has room to spare, and an
 * overlay on a video is the ordinary place for controls.
 *
 * 56 px down, because the camera's own top row is its label (left) and the
 * front/rear switch (right), both 48 px tall. Landscape keeps the group on
 * the map: there the map is a full-height column with room for it.
 */
const PORTRAIT_NAV_TOOLS_TOP = 56

/** The camera pane's controls are shared components that hard-code a desktop
 * height; the touch chrome raises them from the outside rather than forking
 * them, exactly as `TOUCH_TARGET_CSS` does for the strip and the dock. */
const TOUCH_CAMERA_CSS = `
.rh-touchcam [role="group"] button{min-width:48px;min-height:48px}
`

/** The body's own size, measured. Zero until the first observation, which is
 * what `watchPanes` reads as "not laid out yet". */
function useMeasuredSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize((prev) => (
      prev.width === el.clientWidth && prev.height === el.clientHeight
        ? prev
        : { width: el.clientWidth, height: el.clientHeight }
    ))
    measure()
    // The `node` test environment has no ResizeObserver, and neither do a few
    // old mobile browsers; both then keep the one measurement above.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** Re-render once a second while `on`, so a running mission's elapsed time
 * moves. The desktop task bar does the same. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [on])
  return now
}

/**
 * The run, floating in the map pane's bottom-left corner.
 *
 * The same `taskBarModel` the desktop bar reads, in the corner the map's own
 * controls leave free: `NavTools` is top-left, `MapControls` bottom-right and
 * the Walk/Stop bar bottom-centre.
 */
function TouchRunCard({ run, robot, siteId, onDismiss }: {
  run: RobotRunView
  robot: RobotState
  siteId: string
  onDismiss?: () => void
}) {
  const { t } = useTranslation()
  const now = useNow(run?.phase === 'running')
  const model = taskBarModel(run, robot, now)
  // Nothing to say: no run, or a robot simply under manual control, which the
  // strip and the dock already report.
  if (!run || model.slot === 'none' || model.slot === 'manual') return null

  const p = model.progress
  const pct = p?.estimateS ? Math.min(100, Math.round((p.elapsedS / p.estimateS) * 100)) : null
  const elapsed = p
    ? (p.estimateS
      ? t('command.taskBar.run.elapsedOf', { elapsed: formatClock(p.elapsedS), estimate: formatClock(p.estimateS) })
      : t('command.taskBar.run.elapsed', { elapsed: formatClock(p.elapsedS) }))
    : null
  const line = [model.detail, elapsed].filter(Boolean).join(' · ')

  return (
    <div
      data-touch-runcard=""
      className="rh-panel rh-panel--float"
      style={{
        position: 'absolute', left: space[3], bottom: space[3], zIndex: 1002,
        maxWidth: 'min(72%, 360px)', padding: `${space[2]}px ${space[3]}px`,
        borderRadius: radius.md, display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <span
          title={model.title}
          style={{
            fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}
        >
          {model.title}
        </span>
        {model.tag && <Badge tone={model.tagTone} dot>{model.tag}</Badge>}
      </div>

      {line && (
        <span
          title={line}
          style={{
            fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {line}
        </span>
      )}

      {pct !== null && (
        <div
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={t('command.taskBar.run.progressAria')}
          style={{ height: 3, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: color.accentSolid, borderRadius: radius.full }} />
        </div>
      )}

      {(model.buttons.includes('viewRun') || (model.buttons.includes('dismiss') && onDismiss)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], paddingTop: 2 }}>
          {model.buttons.includes('viewRun') && (
            <a
              href={hashForSiteRun(siteId, run.runId)}
              style={{
                fontSize: font.size.sm, color: color.accent, minHeight: 32,
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              {t('command.taskBar.run.viewRun')}
            </a>
          )}
          {model.buttons.includes('dismiss') && onDismiss && (
            <Button size="sm" onClick={onDismiss}>{t('command.taskBar.run.dismiss')}</Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Which camera this is, in the pane's top-left corner.
 *
 * The camera is the one pane whose subject is ambiguous -- front and rear look
 * alike until something moves -- so it gets a word, and the map gets none: a
 * caption on a floorplan is a row of pixels spent saying what the picture
 * already says. */
function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rh-on-video"
      style={{
        position: 'absolute', top: space[2], left: space[2], zIndex: 901,
        padding: `2px ${space[2]}px`, borderRadius: radius.sm,
        fontSize: font.size.xs, fontWeight: font.weight.semibold,
        letterSpacing: '0.04em', textTransform: 'uppercase', pointerEvents: 'none',
      }}
    >
      {children}
    </span>
  )
}

/** The other camera. One function, so the main pane and the tablet's tile can
 * never disagree about which one "the other" is. */
function otherFacing(facing: CameraFacing): CameraFacing {
  return facing === 'front' ? 'back' : 'front'
}

/** This camera's word, from the two strings `DualCamView` labels its panes
 * with. */
function useCameraLabel(facing: CameraFacing): string {
  const { t } = useTranslation()
  return facing === 'front' ? t('liveops.camera.front') : t('liveops.camera.rear')
}

/** The live camera, filling its rect, with the two controls the design puts on
 * it: the capture rail (right edge, its own component) and the front/rear
 * switch, both at 48 px.
 *
 * The facing is the *shell's* state rather than this pane's, because the
 * tablet's second tile swaps by flipping it: one boolean decides both
 * pictures, so neither can show what the other already shows (design 6.3). */
function CameraPane({ robot, rect, facing, onSwap }: {
  robot: RobotState
  rect: Rect
  facing: CameraFacing
  onSwap: () => void
}) {
  const { t } = useTranslation()
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const label = useCameraLabel(facing)

  return (
    <div
      data-touch-pane="camera"
      className="rh-touchcam"
      style={{ ...paneStyle(rect), background: color.videoBg }}
    >
      <style>{TOUCH_CAMERA_CSS}</style>
      <CameraFeedLayer robot={robot} facing={facing} fit={cameraFit} steady steadyBadgeTop={38} />
      <PaneLabel>{label}</PaneLabel>
      {/* Top-right: the capture rail owns the right edge's middle and the
          label the top-left, so the three never overlap. */}
      <IconButton
        className="rh-on-video"
        icon={SwitchCamera}
        label={facing === 'front' ? t('liveops.camera.switchToRear') : t('liveops.camera.switchToFront')}
        onClick={onSwap}
        style={{ position: 'absolute', top: space[2], right: space[2], zIndex: 901, width: 48, height: 48 }}
      />
      <CaptureRail robot={robot} facing={facing} />
    </div>
  )
}

/**
 * The second camera, under the map on a tablet in landscape.
 *
 * It carries a word for the same reason `DualCamView` labels its two panes:
 * front and rear are two near-identical grey frames until something moves, and
 * mistaking one for the other while watching a robot is the failure the label
 * exists to prevent. The map still gets none.
 *
 * **Tapping it swaps the facings** -- the main pane takes this picture and this
 * tile takes the main pane's -- by flipping the single `facing` the shell
 * holds. There is deliberately no "which pane holds what" model: the tile is
 * always `otherFacing(facing)`, so the two cannot drift into showing the same
 * camera.
 *
 * The whole tile is the target, as the driving inset's swap is, rather than an
 * icon inside it; the button lies over its own rect and takes nothing beside
 * it. It carries neither the Steady switch nor the capture rail -- those
 * belong to the camera the operator is actually watching.
 */
function SecondCameraPane({ robot, rect, facing, onSwap }: {
  robot: RobotState
  rect: Rect
  facing: CameraFacing
  onSwap: () => void
}) {
  const { t } = useTranslation()
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const label = useCameraLabel(facing)
  const swapLabel = t('touch.liveops.swapCameraAria')

  return (
    <div data-touch-pane="camera2" style={{ ...paneStyle(rect), background: color.videoBg }}>
      <CameraFeedLayer robot={robot} facing={facing} fit={cameraFit} />
      <PaneLabel>{label}</PaneLabel>
      <button
        type="button"
        data-touch-swap=""
        onClick={onSwap}
        aria-label={swapLabel}
        title={swapLabel}
        style={{
          position: 'absolute', inset: 0, zIndex: 902,
          minWidth: 48, minHeight: 48,
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

/**
 * The watching body: map and camera, each filling its own rect.
 *
 * Task 14 adds the driving counterpart beside this one and switches on
 * `operatorHoldsControl(robot)`; the body element, its measurement and the
 * geometry module are shared with it.
 */
export function TouchWatchLayout({
  siteId, robot, mission, run, orientation, big, barH, dockH, onDismissRun,
}: TouchBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { width, height } = useMeasuredSize(bodyRef)
  const siteMap = useSiteMap()
  const panes = watchPanes({ orientation, big, width, height, barH, dockH })
  const measured = width > 0 && height > 0
  // One piece of state for both pictures: the main pane shows `facing`, the
  // tablet's tile the other one, and the switch and the tile are the same tap.
  const [facing, setFacing] = useState<CameraFacing>('front')
  const swapFacing = () => setFacing(otherFacing)
  // Where the map's tool group is drawn in portrait. A state ref rather than
  // a `useRef`, because the map has to re-render once the host element
  // exists -- a ref's mutation would not tell it.
  const [navToolsHost, setNavToolsHost] = useState<HTMLDivElement | null>(null)
  const portrait = orientation === 'portrait'

  return (
    <div
      ref={bodyRef}
      data-touch-body=""
      data-orientation={orientation}
      data-size={big ? 'big' : 'small'}
      style={{
        flex: 1, minHeight: 0, minWidth: 0, position: 'relative',
        background: color.bg,
        // Carried over from the desktop workspace: the panes' own overlay
        // z-indexes (video labels, camera bars) stay inside this box rather
        // than competing with the dock's sheet and dialogs above it.
        isolation: 'isolate',
      }}
    >
      {/* Nothing is drawn until the body has been measured: a pane sized from
          an unmeasured box would paint at the wrong extent and make Leaflet
          fit the site to it. One frame -- the observer fires on observe. */}
      {measured && (
        <>
          <div data-touch-pane="map" style={paneStyle(panes.map)}>
            {/* Fills the rect, draws the surveyed floor, and keeps NavTools --
                MapCanvas mounts those itself on a surveyed floor. */}
            <MapCanvas
              robot={robot} mission={mission} variant="full" {...siteMap}
              fitPadding={TOUCH_FIT_PADDING}
              navToolsPortal={portrait ? navToolsHost : null}
              navToolsAt={portrait ? { top: 0, left: space[3] } : undefined}
            />
            <TouchRunCard run={run} robot={robot} siteId={siteId} onDismiss={onDismissRun} />
          </div>

          <CameraPane robot={robot} rect={panes.camera} facing={facing} onSwap={swapFacing} />

          {/* A rect only on a tablet in landscape; `null` on a phone and in
              any portrait body, where a third tile would leave each pane about
              70 px of height. Read, never re-derived here. */}
          {panes.camera2 !== null && (
            <SecondCameraPane
              robot={robot} rect={panes.camera2}
              facing={otherFacing(facing)} onSwap={swapFacing}
            />
          )}

          {/* The portrait home of the map's tool group: over the camera, at
              the top of the screen. Zero height on purpose -- the group
              inside positions itself absolutely and paints outside this box,
              so the host intercepts no taps of its own and the camera under
              it stays reachable everywhere the buttons are not. */}
          {portrait && (
            <div
              ref={setNavToolsHost}
              data-touch-navtools=""
              style={{
                position: 'absolute', top: PORTRAIT_NAV_TOOLS_TOP, left: 0,
                width: '100%', height: 0, zIndex: 940,
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

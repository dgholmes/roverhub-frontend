import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { SwitchCamera } from 'lucide-react'
import { IconButton } from '@/components/kit'
import { CameraFeedLayer } from '@/components/liveops/hero/CameraFeedLayer'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import type { FitPadding } from '@/components/liveops/map/FitToSite'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { color, font, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { useSiteMap } from '@/liveops/useSiteMap'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import { TouchDriveLayer } from './TouchDriveLayer'
import type { TouchBodyProps } from './TouchWatchLayout'
import {
  cornerEstopSize, DRIVE_INSET_MARGIN, drivePanes, paneStyle, watchPanes, type Rect,
} from './touchLayout'

/**
 * Driving a robot from a handheld (design §7.2.3, §7.2.4, §7.2.5).
 *
 * **The gate is `operatorHoldsControl(robot)`, full stop: holding control means
 * driving.** There is no Monitor-while-held intermediate state and no
 * self-flipping layout — `TouchLiveOps` renders this body instead of
 * `TouchWatchLayout` on that predicate alone, never on `abstract_state` (a
 * wheel robot reads MANUAL merely for being upright) and never on a `mission:`
 * or `nav:` owner (control held by a program, not a person).
 *
 * The known cost, accepted deliberately (operator, 2026-11-23): Take control is
 * also how a run is paused, so pausing a mission collapses the map at the
 * moment the operator may most want it. Two things make that cheap rather than
 * a trap — **the inset is tappable to swap**, promoting the map back to full
 * size exactly as `HeroInset` does on the desktop, and Release control returns
 * the watching deck.
 *
 * ## What is where
 *
 * - **Landscape**: the camera takes the body; the map shrinks into a 150 × 96
 *   inset at the top-left. The shrink is a `transform`-only animation of 220 ms
 *   so the mode change is readable rather than a teleport, and it is skipped
 *   entirely under `prefers-reduced-motion`. Transform-only matters for a
 *   second reason: animating the pane's width and height would resize Leaflet
 *   sixty times a second.
 * - **Portrait** keeps BOTH views: the 4:3 feed pinned to the top at its native
 *   aspect, the map taking every pixel underneath. This is the one place
 *   portrait is strictly better than landscape, and the layout says so.
 * - **The corner E-Stop** sits top-right, below the strip, because while
 *   driving both thumbs are on the sticks and the dock's own stop is where a
 *   palm rests. It is rendered here **unconditionally** — outside the measured
 *   guard, and with no reference to control ownership — which is the whole
 *   point: the surface below it may unmount under the operator's thumbs, and
 *   the stop control may not go with it.
 * - **The sticks** are `TouchDriveLayer`, mounted unconditionally and
 *   self-gating, **keyed on orientation**. A rotation mid-drive is a remount,
 *   and a remount is a commanded stop (`useDriveLoop`'s cleanup plus each
 *   `Joystick`'s release) rather than a stale setpoint left live.
 *
 * ⚠️ **The dock keeps its own E-Stop.** Design §7.2.5 moves the stop control
 * out of the dock while driving and narrows the dock's key set; both are
 * changes to `TouchDock`, which this layout does not own. What is added here is
 * the corner control. Two stop controls on screen is additive — no state of
 * this shell has fewer than one — but the dock's narrowing is still owed.
 */

/** Near zero, as in the watching layout: nothing floats over the map that the
 * fit has to avoid. */
const TOUCH_FIT_PADDING: FitPadding = { topLeft: [8, 8], bottomRight: [8, 8] }

/** How long the map takes to shrink into the corner (design §7.2.3). */
export const INSET_TRANSITION_MS = 220

/** `EStopButton` hard-codes a 148 × 48 surface sized for the desktop command
 * bar. The corner control is a different shape, and the type is smaller.
 *
 * ⚠️ **The size comes from `EStopButton`'s own `fill` prop, not from here.**
 * This block used to carry `width:100%;height:100%;min-width:0` too, and it
 * did nothing: that component sets its box in an INLINE style, which beats a
 * stylesheet rule. The stop rendered 148 px wide inside a 96 px box and had
 * its label clipped off the right edge of the screen. Type and icon size are
 * safe to set here because the component sets neither inline on the surface. */
const CORNER_ESTOP_CSS = `
.rh-touchestop button{gap:4px}
.rh-touchestop button span span{font-size:var(--rh-estop-font);letter-spacing:0.02em}
.rh-touchestop button svg{width:var(--rh-estop-icon);height:var(--rh-estop-icon)}
`

/** The body's own size, measured. Zero until the first observation, which the
 * pane geometry reads as "not laid out yet". The watching layout keeps its own
 * copy of this: both are a `ResizeObserver` on the element each renders, and
 * neither shell may guess the size the flexbox gave it. */
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
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** Does this viewer want motion suppressed? Guarded at every step: the module
 * is imported in Vitest's `node` environment, where there is no `window`. */
function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    let media: MediaQueryList
    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)')
    } catch {
      return
    }
    const sync = () => setReduced(media.matches)
    sync()
    // Safari before 14 has only the deprecated addListener/removeListener pair.
    if (media.addEventListener) media.addEventListener('change', sync)
    else media.addListener?.(sync)
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', sync)
      else media.removeListener?.(sync)
    }
  }, [])
  return reduced
}

/**
 * The stop control, in the corner a palm will not find.
 *
 * It takes no `driving` and reads no control owner, on purpose. The component
 * is the invariant: there is no argument you could pass it that would make the
 * stop disappear.
 *
 * ⚠️ It is rendered by `TouchLiveOps`, NOT by the layout below, and that is
 * deliberate. The body sits inside an `ErrorBoundary`; the dock sits outside
 * every boundary precisely because it carries the E-Stop. While driving the
 * dock gives its own stop up to this one, so if this lived inside the body a
 * crash in the drive layout would leave the operator with no stop control at
 * all. `top` is the strip's height plus the margin, since the shell is the
 * positioning context rather than the body.
 */
export function TouchCornerEstop({ robot, big, top }: { robot: RobotState; big: boolean; top: number }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  const { width, height } = cornerEstopSize(big)

  return (
    <div
      data-touch-estop="corner"
      className="rh-touchestop"
      style={{
        position: 'absolute', top, right: space[2], zIndex: 60,
        width, height, pointerEvents: 'auto', touchAction: 'none',
        ['--rh-estop-font' as string]: big ? '13px' : '11px',
        ['--rh-estop-icon' as string]: big ? '18px' : '15px',
      } as CSSProperties}
    >
      <style>{CORNER_ESTOP_CSS}</style>
      <EStopButton
        fill
        state={robot.abstract_state}
        engageCommand={latestEstopCommand}
        estopAvailability={getCommandAvailability(robot, 'ESTOP')}
        resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
        onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', t('command.estop.engageCommand'))}
        onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', t('command.estop.releaseCommand'))}
      />
    </div>
  )
}

/** Which camera this is, as in the watching layout: the camera is the one pane
 * whose subject is ambiguous until something moves. Drawn inside
 * `CameraControls` below, which owns where the pair sits. */
function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rh-on-video"
      style={{
        padding: `2px ${space[2]}px`, borderRadius: radius.sm,
        fontSize: font.size.xs, fontWeight: font.weight.semibold,
        letterSpacing: '0.04em', textTransform: 'uppercase', pointerEvents: 'none',
      }}
    >
      {children}
    </span>
  )
}

/**
 * The camera's own two controls — which way it is pointing, and the switch
 * that changes it — as one row.
 *
 * ⚠️ **Not in a corner while driving in landscape.** Both were separately
 * absolutely positioned at `bottom: 8, left: 8`, which put them on top of each
 * other AND underneath the left thumb stick: the label read through the
 * stick's ring and the switch could not be tapped at all (operator,
 * 2026-11-25). While driving in landscape all four corners are spoken for —
 * the map inset top-left, the stop top-right, a stick in each bottom corner —
 * so this row goes down the left edge, immediately under the inset. Portrait
 * keeps the bottom-left corner, which the sticks do not reach there: they sit
 * over the map below the camera pane.
 */
function CameraControls({ landscape, insetBottom, children }: {
  landscape: boolean
  /** Where the map inset ends, in the body's own coordinates. */
  insetBottom: number
  children: React.ReactNode
}) {
  return (
    <div
      data-camera-controls=""
      style={{
        position: 'absolute', zIndex: 901,
        left: landscape ? DRIVE_INSET_MARGIN : space[2],
        ...(landscape ? { top: insetBottom + space[2] } : { bottom: space[2] }),
        display: 'flex', alignItems: 'center', gap: space[2],
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}

/**
 * The driving body. It takes the same `TouchBodyProps` as `TouchWatchLayout`,
 * so the shell hands both the identical object and cannot feed one a geometry
 * the other never saw. `siteId` and `run` go unread here on purpose: the run
 * card is a watching affordance, and a run the operator has taken control of
 * is paused — the dock reports it, and the body belongs to the camera.
 */
export function TouchDriveLayout({
  robot, mission, orientation, big, barH, dockH,
}: TouchBodyProps) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const { width, height } = useMeasuredSize(bodyRef)
  const siteMap = useSiteMap()
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const [facing, setFacing] = useState<CameraFacing>('front')
  /** Which picture has the body. Landscape only — portrait shows both at full
   * width, so there is nothing to promote. */
  const [full, setFull] = useState<'camera' | 'map'>('camera')
  const reducedMotion = usePrefersReducedMotion()

  const geometry = { orientation, big, width, height, barH, dockH }
  const panes = drivePanes(geometry)
  const measured = width > 0 && height > 0

  // The shrink runs once, on arrival: `settled` never goes back to false, so a
  // swap later is an instant exchange rather than a second 220 ms slide from a
  // rectangle the map is no longer in.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!measured || settled) return
    setSettled(true)
  }, [measured, settled])

  const camera = <CameraFeedLayer robot={robot} facing={facing} fit={cameraFit} steady steadyBadgeTop={38} />
  const map = (variant: 'full' | 'mini') => (
    <MapCanvas
      robot={robot} mission={mission} variant={variant} {...siteMap}
      fitPadding={TOUCH_FIT_PADDING}
    />
  )

  /** Which camera, and the switch that changes it. `CameraControls` decides
   * where the pair goes; see its note on why neither may be in a corner while
   * driving in landscape. */
  const cameraControls = (
    <CameraControls
      landscape={panes.orientation === 'landscape'}
      insetBottom={panes.orientation === 'landscape' ? panes.mapInset.top + panes.mapInset.height : 0}
    >
      <IconButton
        className="rh-on-video"
        icon={SwitchCamera}
        label={facing === 'front' ? t('liveops.camera.switchToRear') : t('liveops.camera.switchToFront')}
        onClick={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
        style={{ width: 44, height: 44, pointerEvents: 'auto' }}
      />
      <PaneLabel>{facing === 'front' ? t('liveops.camera.front') : t('liveops.camera.rear')}</PaneLabel>
    </CameraControls>
  )

  return (
    <div
      ref={bodyRef}
      data-touch-body=""
      data-touch-driving=""
      data-orientation={orientation}
      data-size={big ? 'big' : 'small'}
      style={{
        flex: 1, minHeight: 0, minWidth: 0, position: 'relative',
        background: color.bg,
        isolation: 'isolate',
        // The page may not scroll or pinch out from under a drive (design §7.3).
        touchAction: 'none',
      }}
    >
      {measured && (panes.orientation === 'landscape' ? (
        <>
          <div
            data-touch-pane={full === 'camera' ? 'camera' : 'map'}
            style={{
              ...paneStyle(panes.camera),
              // The letterbox behind a feed, never behind a floorplan.
              background: full === 'camera' ? color.videoBg : color.bg,
            }}
          >
            {full === 'camera' ? camera : map('full')}
            {full === 'camera' && cameraControls}
          </div>

          <DriveInset
            rect={panes.mapInset}
            from={watchPanes(geometry).map}
            settled={settled}
            reducedMotion={reducedMotion}
            showing={full === 'camera' ? 'map' : 'camera'}
            onSwap={() => setFull((f) => (f === 'camera' ? 'map' : 'camera'))}
          >
            {full === 'camera' ? map('mini') : camera}
          </DriveInset>
        </>
      ) : (
        <>
          <div data-touch-pane="camera" style={{ ...paneStyle(panes.camera), background: color.videoBg }}>
            {camera}
            {cameraControls}
          </div>
          <div data-touch-pane="map" style={paneStyle(panes.map)}>
            {map('full')}
          </div>
        </>
      ))}

      {/* Outside the measured guard: a stop control that waits on a
          ResizeObserver is a stop control missing from the first frame. */}

      {/* Mounted unconditionally -- it gates itself on `operatorHoldsControl`
          and returns null with no hooks before the gate, so losing control is a
          real unmount and therefore a real stop. Keyed on orientation so a
          rotation is one too. */}
      <TouchDriveLayer key={orientation} robot={robot} orientation={orientation} big={big} />
    </div>
  )
}

/**
 * The picture that is not the hero, shrunk into the body's top-left corner and
 * tappable to swap.
 *
 * The animation is FLIP: the pane is rendered **at its destination** and, for
 * the first frame only, transformed back onto the rectangle the map occupied
 * while watching. Nothing but `transform` changes, so Leaflet is laid out once
 * at the inset's size instead of on every frame, and the resting state is
 * exact rather than a scaled approximation of it.
 */
function DriveInset({ rect, from, settled, reducedMotion, showing, onSwap, children }: {
  rect: Rect
  /** Where this picture was a moment ago — the watching layout's map pane. */
  from: Rect
  settled: boolean
  reducedMotion: boolean
  showing: 'map' | 'camera'
  onSwap: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const animate = !reducedMotion
  const sliding = animate && !settled && rect.width > 0 && rect.height > 0
  const label = showing === 'map' ? t('liveops.camera.swapMap') : t('liveops.camera.swapCamera')

  return (
    <div
      data-touch-inset=""
      data-showing={showing}
      // Absent under prefers-reduced-motion: the inset is then simply at its
      // destination, with no transform and no transition at all.
      data-animate={animate ? '' : undefined}
      style={{
        ...paneStyle(rect),
        zIndex: 30,
        borderRadius: radius.md,
        background: color.bg,
        boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
        pointerEvents: 'auto',
        transformOrigin: 'top left',
        transform: sliding
          ? `translate(${from.left - rect.left}px, ${from.top - rect.top}px) scale(${from.width / rect.width}, ${from.height / rect.height})`
          : undefined,
        transition: animate ? `transform ${INSET_TRANSITION_MS}ms cubic-bezier(0.2, 0, 0, 1)` : undefined,
      }}
    >
      {children}
      {/* The whole preview swaps, as `HeroInset` does on the desktop: a 150 px
          card is the target, not an icon inside it. */}
      <button
        type="button"
        data-touch-swap=""
        onClick={onSwap}
        aria-label={label}
        title={label}
        style={{
          position: 'absolute', inset: 0, zIndex: 902,
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', touchAction: 'none',
        }}
      />
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Eye, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Segmented } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { ObstacleAvoidanceToggle } from '@/components/liveops/command/ObstacleAvoidanceToggle'
import { SpeedControl } from '@/components/liveops/command/SpeedControl'
import { commandButtonStyle } from '@/components/liveops/mission/ActionButton'
import {
  applyLookDelta, LOOK_NEUTRAL, lookTargetDue, type LookTarget,
} from '@/components/liveops/hero/lookAround'
import type { Orientation } from '@/lib/touchShell'
import { DRIVE_INPUT_POLL_MS } from '@/lib/teleop'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import { gaitPickerModelFor } from '@/liveops/postureModel'
import { useDriveLoop } from '@/liveops/useDriveLoop'
import { speedPctOf, useDriveSpeed } from '@/store/useDriveSpeedStore'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import { TOUCH_CONTROL_HEIGHT } from './TouchTopStrip'
import { Joystick, type StickVector } from './Joystick'
import { AUTO_RELEASE_SECONDS, touchDriveTick, touchLookDelta } from './touchDriveIntent'

/**
 * The touch console's drive surface: two thumb sticks, the drive strip above
 * the dock, and the deadman countdown (design §7.2.3, §7.3).
 *
 * **It mounts on `operatorHoldsControl(robot)` and on nothing else** — never
 * `abstract_state` (a wheel robot reports MANUAL merely for being upright),
 * never a `mission:` or `nav:` owner (control held by a program, not a person).
 * The gate is the whole safety story of this file: when a mission or another
 * operator takes `control_owner`, `TouchDriveLayer` returns `null`, the surface
 * below it unmounts under the operator's thumb, and TWO real stop paths run —
 * `useDriveLoop`'s cleanup commands one explicit zero-velocity DRIVE, and each
 * `Joystick`'s unmount effect recentres and emits `{x: 0, y: 0}`. Neither is
 * assumed; `TouchDriveLayer.test.tsx` drives both with real pointer events.
 *
 * What this file does NOT own: the E-Stop (anchored in the chrome, never gated
 * by control ownership), the dock's command set (`TouchDock`, from the shared
 * `commandDeck`), and where the layer sits (Task 14's `TouchDriveLayout` passes
 * `style`).
 *
 * ## One speed model
 *
 * The strip's speed control is the console's existing `command/SpeedControl`,
 * which writes `useDriveSpeedStore`: a PERCENTAGE the robot itself enforces.
 * The sticks are always full stick (`touchDriveIntent.ts` says why), and the %
 * rides along as every DRIVE's ratio — stops included, because the bridge sets
 * the robot's speed % from each one.
 */

/** Pad diameter: big enough to aim with a thumb without covering the view. */
function stickSize(big: boolean): number {
  return big ? 132 : 104
}

/** Shared command buttons hard-code a 36 px height (`commandButtonStyle`),
 * which is below a comfortable touch target. The touch chrome raises them from
 * the outside rather than forking them — the same trick as `TOUCH_TARGET_CSS`
 * in `TouchTopStrip`, scoped to this layer's own class. */
const DRIVE_STRIP_CSS = `
.rh-touchdrive button{min-height:var(--rh-touch-target,44px)}
`

export interface TouchDriveLayerProps {
  robot: RobotState
  orientation: Orientation
  /** Tablet sizing. Phone portrait is the one combination that collapses the
   * drive strip, so both axes are needed. */
  big: boolean
  /** Where the layer sits inside the body. Task 14 owns placement. */
  style?: CSSProperties
}

export function TouchDriveLayer({ robot, orientation, big, style }: TouchDriveLayerProps) {
  // No hooks before this gate on purpose: the surface below owns every hook,
  // so losing control is an UNMOUNT, which is what makes the stop real.
  if (!operatorHoldsControl(robot)) return null
  return <DriveSurface robot={robot} orientation={orientation} big={big} style={style} />
}

function DriveSurface({ robot, orientation, big, style }: TouchDriveLayerProps) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const lookRobot = useLiveOpsStore((s) => s.lookRobot)

  const speedPct = speedPctOf(useDriveSpeed(robot.robot_id))
  const speedPctRef = useRef(speedPct)
  speedPctRef.current = speedPct

  // The sticks' newest deflections, and which of them a finger is on. Refs,
  // because the drive loop polls them every 50 ms and a re-render per poll
  // would be 20 renders a second for a knob that already moves itself.
  const leftRef = useRef<StickVector>({ x: 0, y: 0 })
  const rightRef = useRef<StickVector>({ x: 0, y: 0 })
  const downRef = useRef(new Set<'move' | 'turn'>())

  const [looking, setLooking] = useState(false)
  const lookingRef = useRef(false)
  const lookTargetRef = useRef<LookTarget>(LOOK_NEUTRAL)

  /** A drive-strip control or the dock was touched since the last poll. One
   * tick's worth of "the operator is still here", consumed below. */
  const controlTouchRef = useRef(false)

  const [secondsLeft, setSecondsLeft] = useState(AUTO_RELEASE_SECONDS)
  const resetDeadman = useCallback(() => setSecondsLeft(AUTO_RELEASE_SECONDS), [])

  // ── The drive loop ────────────────────────────────────────────────────────
  // The same core the desktop overlay feeds, so both shells publish DRIVE
  // identically. Leaving -- control lost, orientation change, unmount --
  // commands a stop from the hook's own cleanup.
  useDriveLoop(
    robot.robot_id,
    () => {
      const touched = controlTouchRef.current
      controlTouchRef.current = false
      return touchDriveTick(
        leftRef.current,
        rightRef.current,
        speedPctRef.current,
        lookingRef.current,
        downRef.current.size > 0,
        touched,
      )
    },
    resetDeadman,
  )

  // ── The look loop ─────────────────────────────────────────────────────────
  // While Look is lit the right stick moves a target instead of turning the
  // robot, and this sends the newest one no more often than `lookTargetDue`
  // allows -- each becomes a robot move of at least half a second that the next
  // target cancels. `lookAround.ts` is reused unchanged (design §7.3).
  useEffect(() => {
    let lastSent: LookTarget | null = null
    let lastSentAt = 0
    const timer = setInterval(() => {
      if (!lookingRef.current) {
        lastSent = null
        return
      }
      const v = rightRef.current
      if (v.x !== 0 || v.y !== 0) {
        const { dxPx, dyPx } = touchLookDelta(v)
        lookTargetRef.current = applyLookDelta(lookTargetRef.current, dxPx, dyPx)
      }
      const now = Date.now()
      const next = lookTargetRef.current
      if (lookTargetDue(lastSent, next, lastSentAt, now) && lookRobot(robot.robot_id, next)) {
        lastSent = next
        lastSentAt = now
      }
    }, DRIVE_INPUT_POLL_MS)
    return () => clearInterval(timer)
  }, [robot.robot_id, lookRobot])

  // ── The deadman ───────────────────────────────────────────────────────────
  // Mounted only while this operator holds control, so it needs no gate of its
  // own. The desktop overlay owns the same timeout for the desktop shell; the
  // touch shell does not mount that overlay, so this is the only one running.
  const dispatchCommandRef = useRef(dispatchCommand)
  dispatchCommandRef.current = dispatchCommand
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          dispatchCommandRef.current(robot.robot_id, 'RELEASE_CONTROL', i18n.t('misc.cmdReleaseAuto'))
          return AUTO_RELEASE_SECONDS
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [robot.robot_id])

  // A hand on any console control is a hand on the console (design §7.4: "a
  // drive-strip change, or a dock tap"). Capture-phase and document-wide,
  // because the dock is `TouchDock`'s and this layer must not reach into it;
  // the sticks are excluded, since they report themselves through `onActive`.
  useEffect(() => {
    const onDown = (e: Event) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-touch-stick]')) return
      if (!target.closest('[data-touch-drive-strip], [data-touch-dock]')) return
      controlTouchRef.current = true
      resetDeadman()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [resetDeadman])

  const setDown = (which: 'move' | 'turn') => (down: boolean) => {
    if (down) downRef.current.add(which)
    else downRef.current.delete(which)
    if (down) resetDeadman()
  }

  const toggleLook = () => {
    const next = !lookingRef.current
    lookingRef.current = next
    setLooking(next)
    if (!next) {
      // Leaving look returns the body to neutral, exactly as releasing the
      // middle button does on the desktop.
      lookTargetRef.current = LOOK_NEUTRAL
      lookRobot(robot.robot_id, LOOK_NEUTRAL)
    }
    resetDeadman()
  }

  const size = stickSize(big)
  const pad = big ? space[4] : space[3]
  const gaitPicker = gaitPickerModelFor(robot)
  // The one combination with no room for a row of controls above the dock
  // (design §7.2.4). It collapses into this layer's own "..." rather than the
  // dock's, which belongs to `TouchDock`.
  const collapsed = !big && orientation === 'portrait'

  const strip = (
    <>
      <div data-strip-control="speed" style={{ display: 'flex' }}>
        <SpeedControl robotId={robot.robot_id} />
      </div>

      <div data-strip-control="gait" style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        {gaitPicker.kind === 'toggle' ? (
          <Segmented
            label={t('liveops.manual.gait')}
            value={gaitPicker.options.find((o) => o.active)?.gait ?? ''}
            onChange={(gait) => dispatchCommand(robot.robot_id, 'SET_GAIT', t('misc.cmdSetGait'), { gait })}
            options={gaitPicker.options.map((o) => ({ value: o.gait, label: o.label }))}
          />
        ) : (
          <span style={{ fontSize: font.size.sm, color: color.t2, whiteSpace: 'nowrap' }}>
            {gaitPicker.options[0]?.label}
          </span>
        )}
      </div>

      <div data-strip-control="avoidance" style={{ display: 'flex' }}>
        <ObstacleAvoidanceToggle
          robot={robot}
          onToggle={(enabled) => dispatchCommand(
            robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
            enabled ? t('command.avoidance.enableCommand') : t('command.avoidance.disableCommand'),
            { enabled },
          )}
        />
      </div>

      {/* Look: while it is lit the right stick tilts and twists the standing
          body instead of turning the robot, and `vyaw` is 0. */}
      <div data-strip-control="look" style={{ display: 'flex' }}>
        <button
          type="button"
          onClick={toggleLook}
          aria-pressed={looking}
          title={t('liveops.touch.look')}
          style={{ ...commandButtonStyle(looking ? 'blue' : 'default'), cursor: 'pointer' }}
        >
          <Eye size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('liveops.touch.look')}</span>
        </button>
      </div>
    </>
  )

  return (
    <div
      data-touch-drive=""
      data-orientation={orientation}
      className="rh-touchdrive"
      style={{
        position: 'absolute', inset: 0, zIndex: 40,
        // The sticks and the strip take pointers; everything else below the
        // layer -- the map inset, the camera's own controls -- stays reachable.
        pointerEvents: 'none',
        // Without this a drag that starts on the layer scrolls or pinch-zooms
        // the page and the browser cancels the touch mid-command. Each
        // interactive child sets it too, since they are what a finger lands on.
        touchAction: 'none',
        ['--rh-touch-target' as string]: `${TOUCH_CONTROL_HEIGHT}px`,
        ...style,
      } as CSSProperties}
    >
      <style>{DRIVE_STRIP_CSS}</style>

      {/* Centred above the dock. Scrolls rather than wrapping: a second row
          would eat the view, which on a handheld is the scarce resource. */}
      <div
        data-touch-drive-strip=""
        data-collapsed={collapsed ? '' : undefined}
        style={{
          position: 'absolute', left: '50%', bottom: pad, transform: 'translateX(-50%)',
          maxWidth: `calc(100% - ${2 * (size + pad * 2)}px)`,
          display: 'flex', alignItems: 'center', gap: space[2],
          padding: `${space[1]}px ${space[2]}px`,
          borderRadius: radius.md,
          background: color.overlay,
          pointerEvents: 'auto', touchAction: 'none',
          overflowX: 'auto', scrollbarWidth: 'none',
        } as CSSProperties}
      >
        <Deadman secondsLeft={secondsLeft} />
        {collapsed ? <CollapsedStrip>{strip}</CollapsedStrip> : strip}
      </div>

      <div
        data-touch-stick="drive"
        style={{ position: 'absolute', left: pad, bottom: pad, pointerEvents: 'auto', touchAction: 'none' }}
      >
        <Joystick
          size={size}
          label={t('liveops.touch.stickDrive')}
          onChange={(v) => { leftRef.current = v }}
          onActive={setDown('move')}
        />
      </div>

      <div
        data-touch-stick="sidestep"
        style={{ position: 'absolute', right: pad, bottom: pad, pointerEvents: 'auto', touchAction: 'none' }}
      >
        <Joystick
          size={size}
          // Looking needs both axes -- pitch as well as yaw. Sidestepping needs
          // only the horizontal, so a thumb drifting up or down changes nothing.
          axis={looking ? 'both' : 'x'}
          label={looking ? t('liveops.touch.look') : t('liveops.touch.stickSidestep')}
          onChange={(v) => { rightRef.current = v }}
          onActive={setDown('turn')}
        />
      </div>
    </div>
  )
}

/** The drive strip's controls behind a "..." at phone-portrait size, where
 * there is no room for a row above the dock. */
function CollapsedStrip({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('command.overflow.more')}
        style={{ ...commandButtonStyle(), cursor: 'pointer', background: open ? color.cardHover : color.card }}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: space[2],
            display: 'flex', flexWrap: 'wrap', gap: space[2], padding: space[2],
            background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.md,
          }}
        >
          {children}
        </div>
      )}
    </>
  )
}

/**
 * The 60 s auto-release, as a ring that empties.
 *
 * ⚠️ Design §7.2.3 puts this ring on the dock's Release control. The dock is
 * `TouchDock`'s, and reaching into another shell component's buttons from here
 * would be the drift anti-goal #2 exists to prevent, so it lives at the head of
 * the drive strip instead — on screen, beside the controls, while a drive is
 * live. Moving it onto the Release key is a change to `TouchDock`.
 */
function Deadman({ secondsLeft }: { secondsLeft: number }) {
  const { t } = useTranslation()
  const progress = Math.max(0, Math.min(1, secondsLeft / AUTO_RELEASE_SECONDS))
  const r = 7
  const circumference = 2 * Math.PI * r
  const low = secondsLeft <= 10
  return (
    <span
      data-touch-deadman=""
      title={t('liveops.manual.releasesIn', { seconds: secondsLeft })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        paddingRight: space[1],
        fontSize: font.size.sm, color: low ? color.red : color.t3,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
        <circle cx={9} cy={9} r={r} fill="none" stroke={color.border} strokeWidth={2.5} />
        <circle
          cx={9} cy={9} r={r} fill="none" stroke={low ? color.red : color.accent} strokeWidth={2.5}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
          transform="rotate(-90 9 9)"
        />
      </svg>
      {secondsLeft}
    </span>
  )
}

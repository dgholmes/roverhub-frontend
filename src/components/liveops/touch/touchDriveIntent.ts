import { DRIVE_INPUT_POLL_MS, DRIVE_STOP, type DriveSetpoint } from '@/lib/teleop'
import type { DriveTick } from '@/liveops/driveLoop'
import { FULL_STICK } from '@/components/liveops/hero/manualControlMath'
import { LOOK_LIMIT_DEG, LOOK_SENSITIVITY_DEG_PER_PX } from '@/components/liveops/hero/lookAround'
import { leftStickAxes, rightStickAxes, type StickVector } from './joystickMath'

/**
 * One poll of the touch console's drive surface, as a pure function — the
 * touch counterpart of `hero/manualControlMath.ts`'s `driveTickFor`, which is
 * the worked example of what a shell's input adapter owes the shared drive
 * loop (`@/liveops/driveLoop`). Nothing here touches the DOM, React or the
 * store, so it is testable under this repo's `environment: 'node'` harness.
 *
 * ## There is ONE speed model, and it is a percentage
 *
 * The operator's speed is `store/useDriveSpeedStore.ts` — Slow/Normal/Fast/
 * Custom as a PERCENTAGE (30/60/80), which every DRIVE carries as its fifth
 * argument and which the ROBOT enforces, exactly as the handheld remote works.
 * So a stick at the rim asks for `FULL_STICK` at every speed, just as a held
 * key does, and `speedPct` rides along as the tick's `ratio` without scaling
 * anything here. A console that capped the sticks per tier as well would slow
 * the robot twice and would make the touch speed control change no robot speed
 * at all.
 *
 * ## The deadman is deliberately broad
 *
 * `active` is the only signal `useDriveLoop` passes to the 60 s auto-release,
 * and it is not derived from the setpoint. A thumb resting on a centred stick,
 * or a tap on the drive strip, is an operator who is still there — the design
 * (§7.4) asks for a deadman "as broad as desktop's", because one stricter on
 * touch than on a keyboard drops control under an operator's hand.
 *
 * An inactive tick still asks for `DRIVE_STOP`, so a drive surface nobody is
 * touching is a robot the loop is stopping, not merely not commanding.
 */

/** The teleoperation deadman, shared with the desktop overlay. */
export { AUTO_RELEASE_SECONDS } from '@/lib/teleop'

/** How long a full throw of the look stick takes to sweep the robot's whole
 * look range. Slow enough to aim with a thumb, fast enough that reaching the
 * far edge is not a chore. */
export const LOOK_SWEEP_MS = 1000

/**
 * Pixels of equivalent mouse movement a full stick throw contributes per
 * millisecond, since `applyLookDelta` is specified in the desktop mouse's own
 * units (deg per px). Derived rather than tuned by hand, so changing either
 * the SDK's ±11.5° limit or the mouse sensitivity keeps the sweep honest.
 */
export const LOOK_STICK_PX_PER_MS =
  (2 * LOOK_LIMIT_DEG) / LOOK_SENSITIVITY_DEG_PER_PX / LOOK_SWEEP_MS

/**
 * What the look stick asks of `applyLookDelta` over `elapsedMs`.
 *
 * Signs pass straight through: the screen's y points down and so does
 * `applyLookDelta`'s pitch (pitch > 0 leans the robot forward, pointing the
 * camera DOWN), and both x axes point right. Pushing the stick where you want
 * to look is therefore the whole mapping.
 */
export function touchLookDelta(
  v: StickVector,
  elapsedMs: number = DRIVE_INPUT_POLL_MS,
): { dxPx: number; dyPx: number } {
  const px = LOOK_STICK_PX_PER_MS * elapsedMs
  return { dxPx: v.x * px, dyPx: v.y * px }
}

/**
 * One tick of the two sticks.
 *
 * @param left        the translation stick's deflection, [-1, 1] per axis
 * @param right       the turn (or, while looking, the look) stick's deflection
 * @param speedPct    `useDriveSpeedStore`'s % — the tick's `ratio`, never a cap
 * @param looking     the Look chip is lit: the robot stands still and looks
 * @param sticksDown  a finger is on either stick, deflected or centred
 * @param controlTouched a drive-strip control or the dock was touched this tick
 */
export function touchDriveTick(
  left: StickVector,
  right: StickVector,
  speedPct: number,
  looking: boolean,
  sticksDown: boolean,
  controlTouched: boolean = false,
): DriveTick {
  const active = sticksDown || controlTouched

  // Looking around stands the robot still: balance pitch and yaw exist only in
  // balance_stand (lookAround.ts), so this is not "turn suppressed" but "drive
  // suppressed" -- the same thing `driveDirectionsDuringLook` does to held keys
  // on the desktop.
  const translation = leftStickAxes(left, FULL_STICK)
  const turn = rightStickAxes(right, FULL_STICK)
  const setpoint: DriveSetpoint = active && !looking
    ? { vx: translation.vx, vy: translation.vy, vyaw: turn.vyaw }
    : DRIVE_STOP

  // `holdSteering` arms the desktop mouse's steering throttle and means
  // nothing here: there is no mouse yaw on a tablet, and holding back a
  // thumb's turn would make the stick lag the robot.
  return { setpoint, ratio: speedPct, active, holdSteering: false }
}

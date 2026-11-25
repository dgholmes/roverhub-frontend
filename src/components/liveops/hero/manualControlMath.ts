import { DRIVE_STOP, type DriveSetpoint } from '@/lib/teleop'
import type { DriveTick } from '@/liveops/driveLoop'
import { driveDirectionsDuringLook } from './lookMode'

/**
 * Pure logic for `ManualControlOverlay`, split out so it's testable without
 * component-render tooling (none exists yet for this project — see
 * CLAUDE.md). Nothing here touches the DOM, React, or the store.
 */

export type Direction = 'forward' | 'back' | 'turnLeft' | 'turnRight' | 'strafeLeft' | 'strafeRight'

/**
 * Physical key -> abstract Direction. W/S are forward/back, A/D strafe left and
 * right, Q/E turn (yaw) — matching `edge/sdk_playground/teleop.py`'s reference
 * teleop layout.
 *
 * Arrow keys are deliberately absent. They were bound to movement, and the
 * key handler called `preventDefault()` on them, which meant the primary
 * keyboard-navigation mechanism — scrolling, `<select>` traversal, Radix menu
 * and tab movement, screen-reader browse mode — issued real
 * `VELOCITY_SEQUENCE` commands to a physical robot while the overlay was
 * mounted. WASD/QE is the documented layout and is unambiguous; navigation keys
 * must stay navigation keys. docs/audit/2026-08-12-ui-ux-audit.md A-11.
 */
export const KEY_TO_DIRECTION: Record<string, Direction> = {
  w: 'forward',
  s: 'back',
  a: 'strafeLeft',
  d: 'strafeRight',
  q: 'turnLeft',
  e: 'turnRight',
}

/**
 * The direction a key event asks for, by the PHYSICAL key first. `e.key`
 * alone missed Caps Lock ("W") and Korean input mode ("ㅈ"), and the robot
 * ignored every key on both (2026-11-18); `e.code` ("KeyW") is the same key
 * in every case and layout. `e.key` stays as the fallback for an event with no
 * code (some synthetic events and older test helpers).
 */
export function keyDirection(e: { code?: string; key: string }): Direction | undefined {
  const fromCode = e.code?.startsWith('Key') ? KEY_TO_DIRECTION[e.code.slice(3).toLowerCase()] : undefined
  return fromCode ?? KEY_TO_DIRECTION[e.key.toLowerCase()]
}

/** Is this the key `letter` ("m"), by physical key first, as keyDirection. */
export function isLetterKey(e: { code?: string; key: string }, letter: string): boolean {
  if (e.code?.startsWith('Key')) return e.code.slice(3).toLowerCase() === letter
  return e.key.toLowerCase() === letter
}

/**
 * Full stick, as the handheld remote gives it: the top of the /joy curves
 * measured on rover-jetson 2026-10-30, mirrored from
 * roverhub-edge/robot_bridge/joy_mapping.py (FORWARD_CURVE, STRAFE_CURVE,
 * TURN_CURVE). A held key asks for all of it, and the robot scales it by its own
 * speed % -- the operator's speed setting (useDriveSpeedStore), which every
 * DRIVE carries -- so pushing harder can never go faster than what is set.
 */
export const FULL_STICK_FORWARD_MPS = 0.64
export const FULL_STICK_STRAFE_MPS = 0.32
export const FULL_STICK_TURN_RADPS = 1.04

export type DriveLimits = { forward: number; strafe: number; turn: number }

export const FULL_STICK: DriveLimits = {
  forward: FULL_STICK_FORWARD_MPS,
  strafe: FULL_STICK_STRAFE_MPS,
  turn: FULL_STICK_TURN_RADPS,
}

export function velocityFor(held: Set<Direction>, limits: DriveLimits = FULL_STICK) {
  let vx = 0, vy = 0, vyaw = 0
  if (held.has('forward')) vx += limits.forward
  if (held.has('back')) vx -= limits.forward
  if (held.has('strafeLeft')) vy += limits.strafe
  if (held.has('strafeRight')) vy -= limits.strafe
  if (held.has('turnLeft')) vyaw += limits.turn
  if (held.has('turnRight')) vyaw -= limits.turn
  return { vx, vy, vyaw }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * rad/s of yaw contributed per pixel of accumulated `movementX` per tick.
 * Tune here — this is the single knob for mouse-yaw feel.
 */
export const MOUSE_YAW_SENSITIVITY = 0.002

/**
 * Folds an accumulated mouse `movementX` delta (px, summed since the last
 * tick) into a yaw contribution on top of whatever Q/E already contributed
 * this tick, clamped to the same `yawMax` the keyboard-driven yaw respects.
 * Positive `mouseDeltaPx` (mouse moved right) yaws right, matching
 * `turnRight`'s sign convention in `velocityFor` (negative vyaw).
 */
export function applyMouseYaw(vyaw: number, mouseDeltaPx: number, yawMax: number): number {
  return clamp(vyaw - mouseDeltaPx * MOUSE_YAW_SENSITIVITY, -yawMax, yawMax)
}

/**
 * Minimum accumulated `movementX` (px, per tick) below which mouse movement
 * is treated as incidental -- jitter, or the cursor passing through on its
 * way to click something else -- rather than deliberate steering intent.
 * Gates both whether a drive burst fires from mouse input alone and whether
 * the auto-release deadman timer resets on it, so a stray pixel of movement
 * can neither nudge the robot nor stall the timeout (docs/01-prd.md §16.3).
 * This is a second layer of defense on top of steering only in game mode
 * (pointer lock, toggled with M -- see `ManualControlOverlay`).
 */
export const MOUSE_YAW_DEADZONE_PX = 2

export function hasMouseYawIntent(mouseDeltaPx: number, deadzonePx: number = MOUSE_YAW_DEADZONE_PX): boolean {
  return Math.abs(mouseDeltaPx) > deadzonePx
}

/**
 * Mouse steering on a segment-based drive. Every change of setpoint makes the
 * bridge cancel the robot's velocity sequence and start another, and each
 * restart costs a settle (velocity_driver.py). Mouse movement varies the turn
 * rate a little on most polls, so unthrottled it restarted the sequence several
 * times a second and turned worse than Q/E (operator, 2026-10-30). So the
 * mouse's turn rate is rounded to coarse steps, and a change of turn rate alone
 * goes out at most every STEER_MIN_INTERVAL_MS. Stops and changes of walking
 * speed are never held back.
 */
export const MOUSE_YAW_STEP = 0.1
export const STEER_MIN_INTERVAL_MS = 300

export function quantizeYaw(vyaw: number, step: number = MOUSE_YAW_STEP): number {
  const q = Math.round(vyaw / step) * step
  return q === 0 ? 0 : q // never -0, which would read as a change from 0
}

type Setpoint = { vx: number; vy: number; vyaw: number }

/** True when only the turn rate differs and the robot keeps walking. */
export function steeringOnlyChange(previous: Setpoint | null, next: Setpoint): boolean {
  if (previous === null) return false
  if (next.vx === 0 && next.vy === 0 && next.vyaw === 0) return false
  return next.vx === previous.vx && next.vy === previous.vy && next.vyaw !== previous.vyaw
}

export function steeringChangeHeld(lastSentAtMs: number, nowMs: number): boolean {
  return nowMs - lastSentAtMs < STEER_MIN_INTERVAL_MS
}

/**
 * The robot starts moving 0.25-0.67 s after a key goes down (measured
 * 2026-11-05), so a quick tap used to end before it moved at all: a stop/start
 * jerk and nothing else. A key released sooner than this is held until it has
 * been down this long.
 */
export const MIN_KEY_HOLD_MS = 500

export function tapReleaseDelayMs(pressedAtMs: number, releasedAtMs: number): number {
  return Math.max(0, MIN_KEY_HOLD_MS - (releasedAtMs - pressedAtMs))
}

/**
 * One poll of the keyboard/mouse drive surface, as a pure function: what the
 * operator is asking for right now, in the shape the shared drive loop
 * consumes (`@/liveops/driveLoop`). Lifted verbatim out of
 * `ManualControlOverlay`'s drive effect so it is testable under this repo's
 * `environment: 'node'` harness, and so the touch shell's own adapter has a
 * worked example of what an adapter owes the loop.
 *
 * `speedPct` is the operator's speed setting (`useDriveSpeedStore`), which
 * rides along as the DRIVE's ratio and which the ROBOT caps motion at. It
 * never scales the velocities here: a held key asks for full stick at every
 * speed, exactly as the handheld remote works.
 *
 * `mouseDeltaPx` is the movementX accumulated since the last poll -- already
 * zero unless game mode holds the pointer lock, and already zero while
 * looking around.
 */
export function driveTickFor(
  held: Set<Direction>,
  mouseDeltaPx: number,
  looking: boolean,
  speedPct: number,
): DriveTick {
  const mouseYawIntent = hasMouseYawIntent(mouseDeltaPx)
  // Looking around stands the robot still; held keys wait for the release.
  const dirs = driveDirectionsDuringLook(held, looking)
  const active = dirs.size > 0 || mouseYawIntent

  // Full stick: the robot caps it at the speed % the DRIVE carries.
  const { vx, vy, vyaw } = velocityFor(dirs)
  // The mouse's turn rate is rounded, so wobble is no change at all
  // (steeringOnlyChange's doc says why that matters on gRPC). Keyboard yaw is
  // NOT rounded -- Q/E's 1.04 rad/s must stay 1.04.
  const setpoint: DriveSetpoint = active
    ? {
        vx, vy,
        vyaw: mouseYawIntent ? quantizeYaw(applyMouseYaw(vyaw, mouseDeltaPx, FULL_STICK_TURN_RADPS)) : vyaw,
      }
    : DRIVE_STOP

  // Arms the throttle only; the loop owns the decision, because only it knows
  // what was last sent and when.
  return { setpoint, ratio: speedPct, active, holdSteering: mouseYawIntent }
}

/**
 * Whether a pointer event on a drive keycap ends the press.
 *
 * The pad used to listen on `mousedown`/`mouseup`/`mouseleave`. `mouseleave`
 * never fires on touch, so a finger sliding off a key left the robot driving
 * until the bridge's 2 s watchdog braked it. Under pointer events with the
 * pointer captured, the slide keeps the press on the key it started on and
 * every way the pointer can end -- lifted, cancelled by a system gesture, or
 * capture taken away -- arrives here.
 */
const POINTER_RELEASE_EVENTS: ReadonlySet<string> = new Set([
  'pointerup',
  'pointercancel',
  'lostpointercapture',
])

export function isPointerReleaseEvent(type: string): boolean {
  return POINTER_RELEASE_EVENTS.has(type)
}

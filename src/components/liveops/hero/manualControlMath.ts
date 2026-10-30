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

export function velocityFor(held: Set<Direction>, vMax: number, yawMax: number) {
  let vx = 0, vy = 0, vyaw = 0
  if (held.has('forward')) vx += vMax
  if (held.has('back')) vx -= vMax
  if (held.has('strafeLeft')) vy += vMax
  if (held.has('strafeRight')) vy -= vMax
  if (held.has('turnLeft')) vyaw += yawMax
  if (held.has('turnRight')) vyaw -= yawMax
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

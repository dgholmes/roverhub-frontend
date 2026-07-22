/**
 * Pure logic for `ManualControlOverlay`, split out so it's testable without
 * component-render tooling (none exists yet for this project — see
 * CLAUDE.md). Nothing here touches the DOM, React, or the store.
 */

export type Direction = 'forward' | 'back' | 'turnLeft' | 'turnRight' | 'strafeLeft' | 'strafeRight'

/**
 * Physical key -> abstract Direction. W/S are forward/back (unchanged).
 * A/D are strafe left/right (lateral movement) and Q/E are turn left/right
 * (yaw) — kept matching `edge/sdk_playground/teleop.py`'s reference teleop
 * layout, where Q/E turn and A/D strafe.
 */
export const KEY_TO_DIRECTION: Record<string, Direction> = {
  w: 'forward', ArrowUp: 'forward',
  s: 'back', ArrowDown: 'back',
  a: 'strafeLeft', ArrowLeft: 'strafeLeft',
  d: 'strafeRight', ArrowRight: 'strafeRight',
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
 * This is a second layer of defense on top of requiring the steering button
 * to be held in the first place (see `ManualControlOverlay`'s steeringRef).
 */
export const MOUSE_YAW_DEADZONE_PX = 2

export function hasMouseYawIntent(mouseDeltaPx: number, deadzonePx: number = MOUSE_YAW_DEADZONE_PX): boolean {
  return Math.abs(mouseDeltaPx) > deadzonePx
}

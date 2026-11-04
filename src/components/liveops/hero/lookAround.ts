/**
 * Look-around target for `ManualControlOverlay`: holding the middle button and
 * moving the mouse tilts and twists the standing robot so its front camera
 * looks up/down and left/right. Pure, like manualControlMath.ts, because the
 * frontend tests run in `node` with no component renderer.
 *
 * Signs follow the SDK's balance moves (vendored high_level.md §2.9.1):
 * pitch > 0 leans forward, so the camera looks DOWN; yaw > 0 looks RIGHT.
 * Both are limited to ±11.5° and exist only in balance_stand.
 * docs/superpowers/specs/2026-10-30-manual-control-v2-look-around-and-joy-design.md
 */

export interface LookTarget {
  pitchDeg: number
  yawDeg: number
}

export const LOOK_NEUTRAL: LookTarget = { pitchDeg: 0, yawDeg: 0 }

/** The SDK's range for balance_pitch and balance_yaw. */
export const LOOK_LIMIT_DEG = 11.5

/** Degrees per pixel of mouse movement: ~230 px sweeps the whole range. */
export const LOOK_SENSITIVITY_DEG_PER_PX = 0.05

/** Each look target becomes a robot move of at least 0.5 s, so sending every
 * pixel would only queue moves the next target cancels. */
export const LOOK_SEND_MIN_DEG = 1
export const LOOK_SEND_INTERVAL_MS = 200

function clampDeg(value: number): number {
  return Math.max(-LOOK_LIMIT_DEG, Math.min(LOOK_LIMIT_DEG, value))
}

/** Mouse down looks down and mouse right looks right, from the current target. */
export function applyLookDelta(target: LookTarget, dxPx: number, dyPx: number): LookTarget {
  return {
    pitchDeg: clampDeg(target.pitchDeg + dyPx * LOOK_SENSITIVITY_DEG_PER_PX),
    yawDeg: clampDeg(target.yawDeg + dxPx * LOOK_SENSITIVITY_DEG_PER_PX),
  }
}

export function lookTargetDue(lastSent: LookTarget | null, next: LookTarget, lastSentAt: number, now: number): boolean {
  if (lastSent === null) return true
  if (now - lastSentAt < LOOK_SEND_INTERVAL_MS) return false
  return Math.abs(next.pitchDeg - lastSent.pitchDeg) >= LOOK_SEND_MIN_DEG
    || Math.abs(next.yawDeg - lastSent.yawDeg) >= LOOK_SEND_MIN_DEG
}

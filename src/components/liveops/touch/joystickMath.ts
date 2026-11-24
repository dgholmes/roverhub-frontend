/**
 * Pure maths for the touch console's two thumb sticks, split out of
 * `Joystick.tsx` so it is testable under this project's `environment: 'node'`
 * Vitest harness (there is still no component renderer — see CLAUDE.md).
 * Nothing here touches the DOM, React, or the store.
 *
 * ## The scheme (design §7.3)
 *
 *   left stick  -> translation: push up to walk forward, left to strafe left
 *   right stick -> turn only: push left to turn left; its vertical axis is
 *                  ignored entirely, so a thumb that drifts up or down while
 *                  turning changes nothing
 *
 * ## Signs
 *
 * A pointer's y axis points DOWN the screen, while the robot's body frame has
 * forward `+vx`, strafe-left `+vy` and turn-left `+vyaw`
 * (`hero/manualControlMath.ts` `velocityFor`, mirrored from the bridge's
 * `joy_mapping.py`). So each axis is negated exactly once on its way out. The
 * tests assert that by comparing against `velocityFor`'s own output for the
 * equivalent held key rather than by restating the rule — a restated sign can
 * drift from the keyboard mapping without any test noticing, and a sign error
 * here drives a real robot the wrong way under an operator's thumb.
 */

import type { DriveSetpoint } from '@/lib/teleop'
import type { DriveLimits } from '../hero/manualControlMath'

export type Pt = { x: number; y: number }

/** A normalised stick deflection: both components in [-1, 1], |v| <= 1. */
export type StickVector = { x: number; y: number }

/**
 * What a full stick throw asks for, in robot units -- the same `DriveLimits`
 * the keyboard sends, so a stick at the rim is exactly a held key.
 *
 * ⚠️ There is no per-tier m/s cap in this console, and a stick must not invent
 * one. The operator's speed is a PERCENTAGE the robot itself enforces
 * (`store/useDriveSpeedStore.ts`: Slow/Normal/Fast/Custom, 30/60/80), carried
 * as `driveRobot`'s fifth argument, with the velocities always at full stick --
 * exactly as the handheld remote works. Callers pass `FULL_STICK` here and the
 * speed % separately as the tick's `ratio`.
 *
 * Note the limits are asymmetric: forward 0.64 m/s, strafe 0.32 m/s, turn
 * 1.04 rad/s. Driving the strafe axis at the forward limit would make a
 * sideways push twice what any other surface asks for.
 */
export type StickLimits = DriveLimits

/**
 * Fraction of the stick's radius within which a touch is treated as centred.
 *
 * A thumb resting on a glass control is never still, and a stick that reports
 * 0.03 of full throw forever would hold the robot in a permanent creep and keep
 * the bridge's watchdog fed while the operator believes they have stopped.
 * Inside this radius the result is exactly zero — not a small number.
 */
export const STICK_DEAD_ZONE = 0.12

/** Never return -0: it reads as a direction in a log and as a change to a diff. */
function noNegativeZero(n: number): number {
  return n === 0 ? 0 : n
}

/**
 * The deflection of a stick whose centre is `origin` and whose travel is
 * `radius` px, given the pointer at `current`.
 *
 * Magnitude is clamped to the unit circle first, so a corner push is no faster
 * than a straight one and dragging far past the rim just holds full throw, then
 * rescaled across the live range so the output grows from 0 at the dead-zone
 * edge rather than jumping to `deadZone` the moment the finger clears it.
 */
export function stickVector(
  origin: Pt,
  current: Pt,
  radius: number,
  deadZone: number = STICK_DEAD_ZONE,
): StickVector {
  if (!(radius > 0)) return { x: 0, y: 0 }

  const dx = current.x - origin.x
  const dy = current.y - origin.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: 0, y: 0 }

  const magnitude = Math.min(1, length / radius)
  if (magnitude <= deadZone) return { x: 0, y: 0 }

  // Rescale [deadZone, 1] onto [0, 1]. `deadZone >= 1` would divide by zero or
  // go negative, so a dead zone that swallows the whole stick is a dead stick.
  const live = 1 - deadZone
  const scaled = live > 0 ? (magnitude - deadZone) / live : 0

  return {
    x: noNegativeZero((dx / length) * scaled),
    y: noNegativeZero((dy / length) * scaled),
  }
}

/**
 * The left stick's translation, already in m/s at the tier's cap — the drive
 * loop takes a capped setpoint, never normalised axes (design §7.4).
 */
export function leftStickAxes(v: StickVector, limits: StickLimits): DriveSetpoint {
  return {
    vx: noNegativeZero(-v.y * limits.forward),
    vy: noNegativeZero(-v.x * limits.strafe),
    vyaw: 0,
  }
}

/**
 * The right stick's turn, already in rad/s at the limit given. `v.y` is read
 * nowhere: this stick turns and does nothing else.
 */
export function rightStickAxes(v: StickVector, limits: StickLimits): DriveSetpoint {
  return {
    vx: 0,
    vy: 0,
    vyaw: noNegativeZero(-v.x * limits.turn),
  }
}

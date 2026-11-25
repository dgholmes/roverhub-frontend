import { DRIVE_KEEPALIVE_MS } from '@/lib/teleop'

/**
 * The supervised "sideways sweep": a fixed schedule of strafe moves the console
 * drives while an operator who holds control watches, so the robot's sideways
 * speed can be measured at partial stick. The keyboard only ever sends full
 * stick, and only full stick had been measured (right ~40 % slower than left);
 * navigation uses small sideways moves at speed 80 %.
 *
 * The bridge turns a DRIVE's vy (m/s, + is left) into the /joy strafe stick
 * through STRAFE_CURVE in roverhub-edge/robot_bridge/joy_mapping.py, by linear
 * interpolation. Mirrored here so each level names the vy that lands exactly
 * on its stick; strafeSweep.test.ts checks the two agree.
 *
 * Pure: the hook that runs it is useStrafeSweep.
 */

/** Mirror of joy_mapping.STRAFE_CURVE: (stick, vy m/s) points. */
export const STRAFE_CURVE: readonly (readonly [stick: number, vy: number])[] = [
  [0.5, 0.025],
  [0.55, 0.05],
  [0.6, 0.07],
  [0.65, 0.085],
  [0.7, 0.10],
  [0.9, 0.27],
  [1.0, 0.32],
]

/** The stick levels measured, and the vy that gives each through STRAFE_CURVE. */
export const STRAFE_SWEEP_LEVELS: readonly { stick: number; vy: number }[] = [
  // The slow end (2026-11-24, second sweep). 0.7-1.0 were measured at 17:25:
  // 0.30-0.49 m/s left, 0.25-0.42 right. These vy are the bridge curve's lookup
  // keys for sticks 0.5-0.65 (joy_mapping.STRAFE_CURVE), not speeds.
  { stick: 0.5, vy: 0.025 },
  { stick: 0.55, vy: 0.05 },
  { stick: 0.6, vy: 0.07 },
  { stick: 0.65, vy: 0.085 },
]

/** The robot speed % every DRIVE of the sweep carries: navigation's. */
export const STRAFE_SWEEP_SPEED_RATIO = 80

export const STRAFE_HOLD_MS = 2000
export const STRAFE_REST_MS = 1500

/**
 * How often a held setpoint is re-sent. The brief suggested 400 ms; the manual
 * drive loop uses DRIVE_KEEPALIVE_MS (1 s) against the bridge's 2 s
 * DRIVE_WATCHDOG_TIMEOUT_S, and re-sending an unchanged setpoint costs the
 * robot nothing (velocity_driver only re-issues on a real change), so the sweep
 * uses the same cadence rather than a second one.
 */
export const STRAFE_SWEEP_RESEND_MS = DRIVE_KEEPALIVE_MS

export type StrafeSide = 'left' | 'right'

/** One step of the sweep. A rest carries the side and stick of the hold it
 * follows, and vy 0. */
export interface StrafeSweepStep {
  index: number
  kind: 'hold' | 'rest'
  side: StrafeSide
  stick: number
  /** m/s, + is left. 0 for a rest. */
  vy: number
  startMs: number
  durationMs: number
}

function buildSteps(): StrafeSweepStep[] {
  const steps: StrafeSweepStep[] = []
  let at = 0
  const push = (kind: 'hold' | 'rest', side: StrafeSide, stick: number, vy: number, durationMs: number) => {
    steps.push({ index: steps.length, kind, side, stick, vy, startMs: at, durationMs })
    at += durationMs
  }
  // Left then right at each level, so the robot ends roughly where it started.
  for (const { stick, vy } of STRAFE_SWEEP_LEVELS) {
    push('hold', 'left', stick, vy, STRAFE_HOLD_MS)
    push('rest', 'left', stick, 0, STRAFE_REST_MS)
    push('hold', 'right', stick, -vy, STRAFE_HOLD_MS)
    push('rest', 'right', stick, 0, STRAFE_REST_MS)
  }
  return steps
}

export const STRAFE_SWEEP_STEPS: readonly StrafeSweepStep[] = buildSteps()

export const STRAFE_SWEEP_TOTAL_MS = STRAFE_SWEEP_STEPS.reduce((sum, s) => sum + s.durationMs, 0)

export type StrafeSweepAt =
  | { done: false; step: StrafeSweepStep; remainingMs: number }
  | { done: true }

/** Where the sweep is `elapsedMs` after it started. A step owns
 * [startMs, startMs + durationMs); at or past the total it is done. Negative
 * time reads as the first step. */
export function strafeSweepAt(elapsedMs: number): StrafeSweepAt {
  if (elapsedMs >= STRAFE_SWEEP_TOTAL_MS) return { done: true }
  const t = Math.max(0, elapsedMs)
  for (const step of STRAFE_SWEEP_STEPS) {
    if (t < step.startMs + step.durationMs) {
      return { done: false, step, remainingMs: step.startMs + step.durationMs - t }
    }
  }
  return { done: true }
}

/** A clock time as HH:MM:SS (local), for finding the sweep in a recording. */
export function clockTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

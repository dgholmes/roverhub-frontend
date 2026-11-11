/**
 * Manual-drive timing, shared between `ManualControlOverlay` (which watches the
 * held keys/mouse) and `RealDataProvider.driveRobot` (which publishes the
 * resulting velocity setpoint as a `DRIVE` command).
 *
 * ## Why this is no longer a re-issue cadence
 *
 * This file used to define `DRIVE_TICK_MS = 250`: the overlay re-sent a drive
 * burst every 250 ms, and each burst's `duration` had to equal the tick period
 * so consecutive bursts neither gapped nor overlapped. That design was measured
 * against real hardware and was the direct cause of the robot's jittery,
 * half-speed manual driving (`sdk_playground/velocity_continuity_experiment.py`,
 * quad/walk, 2026-08-12):
 *
 *     per-tick bursts    44-53% of samples stalled, 12-15 stalls, mean 0.09 m/s
 *     one long sequence    ~5% of samples stalled,   1-2 stalls, mean 0.186 m/s
 *
 * Every RPC boundary costs the robot a settle. Step boundaries *inside* a single
 * velocity sequence cost nothing -- 24 of them in one call matched a
 * single-step reference exactly. So the fix was to stop re-issuing, and the
 * sequence is now held by the edge bridge (`robot_bridge/velocity_driver.py`),
 * which is the only component able to cancel one.
 *
 * The browser's job shrank accordingly: send a setpoint when the operator's
 * velocity actually CHANGES, and otherwise just prove it is still there.
 */

/**
 * How often the overlay samples held keys/mouse and compares against the last
 * setpoint it sent. Only a *change* results in a command, so this can be fast
 * without generating traffic -- it buys input responsiveness for free. The old
 * design could not poll faster than it was willing to send.
 */
export const DRIVE_INPUT_POLL_MS = 50

/**
 * How often an UNCHANGED setpoint is re-sent while driving continues.
 *
 * This is a liveness signal, not a motion command: the bridge's watchdog brakes
 * if setpoints stop arriving, because a remote operator's uplink can drop while
 * a multi-second sequence is committed, and the robot must not keep driving for
 * an absent operator. Re-sending an unchanged setpoint costs the robot nothing
 * (the driver only re-issues the sequence on a real change), so this is cheap.
 *
 * Must stay comfortably below the bridge's `DRIVE_WATCHDOG_TIMEOUT_S` (2 s) so a
 * single dropped MQTT message does not trip the watchdog mid-drive.
 */
export const DRIVE_KEEPALIVE_MS = 1000

/**
 * The `speed_ratio` a DRIVE carries when its caller names none. The manual-drive
 * overlay always names one -- the operator's speed % from the command bar
 * (`useDriveSpeedStore`), whose Normal this matches -- so this is only a
 * fallback for other callers.
 *
 * The bridge sets the robot's own speed % from each DRIVE, and the robot caps
 * motion at it, as with the handheld remote: a held key asks for full stick and
 * gets the set speed, never more.
 */
export const DRIVE_SPEED_RATIO = 60

/** A velocity setpoint, in the robot's body frame. */
export type DriveSetpoint = { vx: number; vy: number; vyaw: number }

export const DRIVE_STOP: DriveSetpoint = { vx: 0, vy: 0, vyaw: 0 }

/** Below this, a setpoint difference is treated as no change at all.
 *
 * Mouse-yaw accumulation produces continuously varying floats, so exact
 * comparison would report a change on nearly every poll and reintroduce the
 * per-tick re-issue this design exists to remove -- each one costing the robot a
 * settle. Coarse enough to absorb mouse jitter, fine enough that a real speed
 * adjustment still registers. */
export const DRIVE_EPSILON = 0.02

/**
 * True when `next` differs enough from `previous` to be worth sending.
 *
 * A stop is always significant: it must never be swallowed by the epsilon, or
 * releasing the keys could leave the robot driving until the watchdog fires.
 */
export function setpointChanged(
  previous: DriveSetpoint | null,
  next: DriveSetpoint,
  epsilon: number = DRIVE_EPSILON,
): boolean {
  if (previous === null) return true

  const nextIsStop = next.vx === 0 && next.vy === 0 && next.vyaw === 0
  const previousWasStop = previous.vx === 0 && previous.vy === 0 && previous.vyaw === 0
  if (nextIsStop !== previousWasStop) return true

  return (
    Math.abs(next.vx - previous.vx) > epsilon ||
    Math.abs(next.vy - previous.vy) > epsilon ||
    Math.abs(next.vyaw - previous.vyaw) > epsilon
  )
}

/** Whether an unchanged setpoint is now due to be re-sent as a keepalive. */
export function keepaliveDue(
  lastSentAtMs: number,
  nowMs: number,
  intervalMs: number = DRIVE_KEEPALIVE_MS,
): boolean {
  return nowMs - lastSentAtMs >= intervalMs
}

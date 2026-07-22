/**
 * Manual-drive tick timing, shared between `ManualControlOverlay` (which
 * re-issues a drive burst every `DRIVE_TICK_MS` while a key/mouse input is
 * held) and `RealDataProvider.driveRobot` (which sends each burst as a real
 * `VELOCITY_SEQUENCE` command whose `duration` must equal the tick period).
 * Those two values have to stay in lockstep — if the tick interval outruns
 * the burst duration the robot stops moving before the next burst arrives;
 * if the burst duration outruns the tick interval, overlapping bursts queue
 * up at the SDK. Keeping a single source of truth here avoids the two
 * drifting out of sync across separate files.
 *
 * 250ms matches `edge/sdk_playground/teleop.py`'s `tick_seconds` default (a
 * "nudge and settle" cadence tuned against the real Dobot Quad SDK during
 * teleop discovery), rather than the UI's previous ad hoc 150ms.
 */
export const DRIVE_TICK_MS = 250
export const DRIVE_TICK_SECONDS = DRIVE_TICK_MS / 1000

/**
 * Default SDK `speed_ratio` for manual-drive `VELOCITY_SEQUENCE` bursts sent
 * to the real backend. Independent of the UI's own vMax/yawMax speed-cap
 * picker (`SPEED_OPTIONS` in `ManualControlOverlay`), which already bounds
 * vx/vy/vyaw magnitude directly — this only sets the gait's overall SDK
 * speed multiplier (0-100 scale, see `dobot_adapter.py::send_velocity_sequence`).
 */
export const DRIVE_SPEED_RATIO = 60

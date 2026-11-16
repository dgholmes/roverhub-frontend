/**
 * Mirrors shared/schemas/sensors.py (schema 0.0.23). Hand-maintained -- change
 * both together; `src/missions/missionTasks.test.ts` reads that file and fails
 * on drift (skipped, with a warning, while the shared/ clone it reads predates
 * sensors.py).
 *
 * Where the lidar sits on the robot, measured by the robot itself. The bridge
 * estimates the forward/sideways offset from turns on the spot and the tilt
 * from the lidar's IMU while the robot stands still. Height is never measured
 * this way: it stays a typed value.
 *
 * Commands (wired, through the generic command route; see
 * src/sensors/sensorCommands.ts): SET_LIDAR_MOUNT (SetLidarMountParams) and
 * SET_CALIBRATION_MODE (SetCalibrationModeParams). Topic
 * `roverhub/{site}/{robot}/sensors/lidar_mount` (edge -> backend and browser,
 * QoS 1, RETAINED): a LidarMountStatus on start, on every change, and at most
 * every 10 s while the estimate moves.
 */

export const CALIBRATION_MODES = ['off', 'suggest', 'auto'] as const
export type CalibrationMode = typeof CALIBRATION_MODES[number]

export const MOUNT_SOURCES = ['default', 'manual', 'measured', 'auto'] as const
export type MountSource = typeof MOUNT_SOURCES[number]

/** Mirrors `DIFFERS_MIN_M` / `DIFFERS_MIN_DEG`: what "clearly different" means. */
export const DIFFERS_MIN_M = 0.03
export const DIFFERS_MIN_DEG = 1.0
/** Mirrors `AUTO_MAX_STEP_M` / `AUTO_MAX_STEP_DEG`: how far auto moves in one change. */
export const AUTO_MAX_STEP_M = 0.10
export const AUTO_MAX_STEP_DEG = 5.0
/** Mirrors `MAX_MOUNT_HISTORY`. */
export const MAX_MOUNT_HISTORY = 20

export interface LidarMount {
  x_m: number
  y_m: number
  z_m: number
  roll_deg: number
  pitch_deg: number
  yaw_deg: number
}

/** The bounds LidarMount's fields carry in sensors.py (inclusive). */
export const MOUNT_BOUNDS: Readonly<Record<keyof LidarMount, readonly [number, number]>> = {
  x_m: [-1.0, 1.0],
  y_m: [-1.0, 1.0],
  z_m: [-0.5, 1.5],
  roll_deg: [-45.0, 45.0],
  pitch_deg: [-45.0, 45.0],
  yaw_deg: [-180.0, 180.0],
}

export interface LidarMountEstimate {
  x_m: number | null
  y_m: number | null
  sd_x_m: number | null
  sd_y_m: number | null
  roll_deg: number | null
  pitch_deg: number | null
  sd_tilt_deg: number | null
  /** Turns on the spot the offset was measured from. */
  turns: number
  /** IMU samples standing still the tilt was measured from. */
  still_samples: number
  since: string | null
  updated_at: string | null
}

export interface LidarMountChange {
  at: string
  mount: LidarMount
  source: MountSource
  by: string | null
}

export interface LidarMountStatus {
  robot_id: string
  site_id: string
  mode: CalibrationMode
  in_use: LidarMount
  measured: LidarMountEstimate | null
  /** The estimate is confident and differs from in_use by more than
   * DIFFERS_MIN_M / DIFFERS_MIN_DEG. */
  differs: boolean
  /** Newest first. */
  history: LidarMountChange[]
  updated_at: string
}

/** SET_LIDAR_MOUNT's params. "manual": typed by a person (and a Revert);
 * "measured": Apply on the current estimate. */
export interface SetLidarMountParams {
  mount: LidarMount
  source: 'manual' | 'measured'
}

/** SET_CALIBRATION_MODE's params. */
export interface SetCalibrationModeParams {
  mode: CalibrationMode
}

/**
 * Mirrors shared/schemas/scan.py (schema 0.0.17). Hand-maintained -- change
 * both together; `src/missions/missionTasks.test.ts` reads that file and fails
 * on drift.
 *
 * The robot's live lidar scan, published on `roverhub/{site}/{robot}/scan`
 * about twice a second while it is placed on a map, not retained. The points
 * are already in the MAP frame (metres), transformed by the bridge with the pose
 * it believed at the scan's time, so drawing them against the map is the very
 * check AMCL makes: on the walls means the position is right.
 */
import type { Point2D } from './maps'

/** Mirrors `MAX_SCAN_POINTS`. */
export const MAX_SCAN_POINTS = 400

/** Where the lidar was in the map frame when the scan was taken. */
export interface SensorPose {
  x_m: number
  y_m: number
  yaw_rad: number
}

export interface ScanFrame {
  robot_id: string
  site_id: string
  map_id: string
  captured_at: string
  sensor_pose: SensorPose
  /** Map-frame metres, at most MAX_SCAN_POINTS. */
  points: Point2D[]
}

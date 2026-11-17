/**
 * Mirrors shared/schemas/nav_path.py (schema 0.0.24). Hand-maintained -- change
 * both together; `src/missions/missionTasks.test.ts` reads that file and fails
 * on drift (skipped, with a warning, while the shared/ clone it reads predates
 * nav_path.py).
 *
 * The route Nav2 is planning to walk, on `roverhub/{site}/{robot}/nav/path`
 * (edge -> browser, QoS 0, NOT retained): Nav2's global plan in the MAP frame,
 * thinned, at most NAV_PATH_MAX_HZ while a nav goal runs, and one frame with
 * the goal's id and NO points when the goal ends. A client also drops the path
 * when the robot's nav_goal is no longer active, or when no frame has arrived
 * for NAV_PATH_STALE_S. The console's rules are in src/liveops/navPath.ts.
 */
import type { Point2D } from './maps'

/** Mirrors `MAX_NAV_PATH_POINTS`. */
export const MAX_NAV_PATH_POINTS = 400
/** Mirrors `NAV_PATH_MAX_HZ`. */
export const NAV_PATH_MAX_HZ = 2.0
/** Mirrors `NAV_PATH_STALE_S`. */
export const NAV_PATH_STALE_S = 5.0

export interface NavPathFrame {
  robot_id: string
  site_id: string
  map_id: string
  /** The NavGoalStatus.goal_id this path belongs to (the robot's nav_goal on /state). */
  goal_id: string
  captured_at: string
  /** Map-frame metres, from the robot's position when planned to the goal. Empty: no current path. */
  points: Point2D[]
  length_m: number | null
  /** The planner's latest attempt for this goal failed; `points` are then the
   * last plan that succeeded, or empty if none ever did. */
  planning_failed: boolean
}

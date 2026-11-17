import i18n from '@/i18n'
import type { Point2D } from '@/types/maps'
import { MAX_NAV_PATH_POINTS, NAV_PATH_STALE_S, type NavPathFrame } from '@/types/navPath'
import type { NavGoalStatus } from '@/types/robotState'
import type { NavHint } from './navMode'

/**
 * The route Nav2 is planning (schema 0.0.24), as plain rules: what a
 * `nav/path` payload must be to be drawn, which frame belongs to the walk on
 * screen, and where the drawn line starts. NavGoalLayer and LiveScene draw it;
 * the providers deliver it.
 */

/** A frame as the console holds it, and when THIS browser received it (the
 * robot's clock is not the browser's, as for the live scan). */
export interface NavPathSample {
  frame: NavPathFrame
  receivedAt: number
}

/** Without a new frame for this long the path is dropped, so a lost "cleared"
 * frame cannot leave an old route on the map. */
export const NAV_PATH_STALE_MS = NAV_PATH_STALE_S * 1000

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * A nav/path payload (already JSON-parsed) as a NavPathFrame, or null. Like
 * the schema, the whole frame is refused when anything is off -- a missing id,
 * a point that is not finite, more than MAX_NAV_PATH_POINTS points, a negative
 * length: a route drawn half-right would be worse than the dashed line.
 * Absent optional fields take the schema's defaults.
 */
export function parseNavPathFrame(raw: unknown): NavPathFrame | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const f = raw as Record<string, unknown>
  for (const key of ['robot_id', 'site_id', 'map_id', 'goal_id', 'captured_at'] as const) {
    if (typeof f[key] !== 'string') return null
  }
  if (!f.robot_id || !f.map_id || !f.goal_id) return null
  const rawPoints = f.points ?? []
  if (!Array.isArray(rawPoints) || rawPoints.length > MAX_NAV_PATH_POINTS) return null
  const points: Point2D[] = []
  for (const p of rawPoints as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !finite(p[0]) || !finite(p[1])) return null
    points.push([p[0], p[1]])
  }
  const length = f.length_m ?? null
  if (length !== null && (!finite(length) || length < 0)) return null
  const failed = f.planning_failed ?? false
  if (typeof failed !== 'boolean') return null
  return {
    robot_id: f.robot_id as string,
    site_id: f.site_id as string,
    map_id: f.map_id as string,
    goal_id: f.goal_id as string,
    captured_at: f.captured_at as string,
    points,
    length_m: length,
    planning_failed: failed,
  }
}

/** The route as the map draws it: `points` untrimmed (the drawing starts it at
 * the robot, trimPathToRobot), fewer than two meaning "no route to draw". */
export interface NavPathView {
  points: Point2D[]
  failed: boolean
  lengthM: number | null
}

/**
 * The path for the walk on screen, or null to keep the dashed line: null with
 * no sample, no active goal (pass `activeNavGoal`), a frame for another goal or
 * for a map other than `mapId`, a frame NAV_PATH_STALE_MS old, or an empty
 * frame that is not a failure (the goal ended). An empty failed frame is kept:
 * it is what says "Nav2 can't find a route to this goal".
 */
export function currentNavPath(
  sample: NavPathSample | null | undefined,
  goal: Pick<NavGoalStatus, 'goal_id'> | null,
  mapId: string | null | undefined,
  now: number,
): NavPathView | null {
  if (!sample || !goal || !mapId) return null
  const { frame } = sample
  if (frame.goal_id !== goal.goal_id || frame.map_id !== mapId) return null
  if (now - sample.receivedAt >= NAV_PATH_STALE_MS) return null
  if (frame.points.length === 0 && !frame.planning_failed) return null
  return { points: frame.points, failed: frame.planning_failed, lengthM: frame.length_m }
}

/** Whether a view has a line to draw (otherwise the dashed line stays). */
export const drawableNavPath = (view: NavPathView | null | undefined): view is NavPathView =>
  !!view && view.points.length >= 2

/**
 * The path from where the robot is: the part behind it is dropped. The line
 * starts at the point of the path nearest the robot, then follows the path's
 * own vertices to the goal. A path of fewer than two points comes back as is.
 */
export function trimPathToRobot(points: readonly Point2D[], at: Point2D): Point2D[] {
  if (points.length < 2) return [...points]
  let best = Infinity
  let bestSeg = 0
  let bestPoint: Point2D = points[0]
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - ay) * dy) / len2))
    const px = ax + t * dx, py = ay + t * dy
    const d = (at[0] - px) ** 2 + (at[1] - py) ** 2
    if (d < best) { best = d; bestSeg = i; bestPoint = [px, py] }
  }
  return [bestPoint, ...points.slice(bestSeg + 1)]
}

/** The hint line under the map tools while Nav2 cannot plan: amber, worded by
 * whether the robot still has an earlier route to follow. */
export function navPathHint(view: NavPathView | null | undefined): NavHint {
  if (!view?.failed) return null
  return {
    tone: 'amber',
    text: i18n.t(drawableNavPath(view) ? 'liveops.nav.path.failedFollowing' : 'liveops.nav.path.failedNone'),
  }
}

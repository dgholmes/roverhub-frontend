import { NavPathFeed } from '@/liveops/navPathFeed'
import type { NavPathSample } from '@/liveops/navPath'
import type { Point2D } from '@/types/maps'
import type { RobotState } from '@/types'

/** How often the mock planner republishes while a goal runs (the real one is <= 2 Hz). */
export const MOCK_NAV_PATH_MS = 1000

/** Points on the mock route, robot to goal inclusive. */
const SAMPLES = 16

/**
 * A plausible Nav2 plan from `from` to `to`: not the straight line, but a bow
 * around something in the middle -- a quadratic curve whose control point sits
 * off to the left of the midpoint by a quarter of the distance (at least 0.6 m).
 * Rounded to the centimetre, as the bridge publishes it.
 */
export function mockPlannedRoute(from: Point2D, to: Point2D): Point2D[] {
  const [ax, ay] = from, [bx, by] = to
  const dx = bx - ax, dy = by - ay
  const d = Math.hypot(dx, dy)
  if (d === 0) return [[ax, ay], [bx, by]]
  const off = Math.max(0.6, d / 4)
  const cx = (ax + bx) / 2 - (dy / d) * off
  const cy = (ay + by) / 2 + (dx / d) * off
  const round = (v: number) => Math.round(v * 100) / 100
  const out: Point2D[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES, u = 1 - t
    out.push([round(u * u * ax + 2 * u * t * cx + t * t * bx), round(u * u * ay + 2 * u * t * cy + t * t * by)])
  }
  return out
}

const lengthOf = (points: Point2D[]) =>
  Math.round(points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0) * 100) / 100

/**
 * The mock bridge's `nav/path`: while a robot's nav_goal is active it plans a
 * route from where the robot is to the goal about once a second; when the
 * goal stops being active, one empty frame with the goal's id, as the bridge
 * does. Runs only while someone is subscribed to that robot.
 */
export class MockNavPaths {
  private feed = new NavPathFeed()
  private sims = new Map<string, { count: number; timer: ReturnType<typeof setInterval>; goalId: string | null; mapId: string }>()

  /** `getRoute`, when it answers, is the line the robot is really walking (a
   * stuck walk's chosen route, mockStuckWalk.ts), published instead of a plan. */
  constructor(
    private getRobot: (robotId: string) => RobotState | undefined,
    private getRoute: (robotId: string) => Point2D[] | null = () => null,
  ) {}

  subscribe(robotId: string, listener: (sample: NavPathSample) => void): () => void {
    const off = this.feed.subscribe(robotId, listener)
    let sim = this.sims.get(robotId)
    if (!sim) {
      sim = { count: 0, timer: setInterval(() => this.tick(robotId), MOCK_NAV_PATH_MS), goalId: null, mapId: '' }
      this.sims.set(robotId, sim)
    }
    const entry = sim
    entry.count++
    this.tick(robotId)
    let done = false
    return () => {
      if (done) return
      done = true
      off()
      if (--entry.count === 0) {
        clearInterval(entry.timer)
        if (this.sims.get(robotId) === entry) this.sims.delete(robotId)
      }
    }
  }

  private tick(robotId: string): void {
    const sim = this.sims.get(robotId)
    const robot = this.getRobot(robotId)
    if (!sim || !robot) return
    const goal = robot.nav_goal?.state === 'active' ? robot.nav_goal : null
    const base = { robot_id: robot.robot_id, site_id: robot.site_id, captured_at: new Date().toISOString(), planning_failed: false }
    if (!goal) {
      if (sim.goalId !== null) {
        this.feed.push({ ...base, map_id: sim.mapId, goal_id: sim.goalId, points: [], length_m: null })
        sim.goalId = null
      }
      return
    }
    // A new goal replacing a running one: the old one's route is over.
    sim.goalId = goal.goal_id
    sim.mapId = goal.map_id
    const p = robot.position
    if (!p || !Number.isFinite(p.x_m) || !Number.isFinite(p.y_m)) return
    const points = this.getRoute(robotId) ?? mockPlannedRoute([p.x_m, p.y_m], [goal.x_m, goal.y_m])
    this.feed.push({ ...base, map_id: goal.map_id, goal_id: goal.goal_id, points, length_m: lengthOf(points) })
  }

  dispose(): void {
    for (const { timer } of this.sims.values()) clearInterval(timer)
    this.sims.clear()
    this.feed.clear()
  }
}

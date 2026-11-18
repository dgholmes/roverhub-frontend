import { NAV_STUCK_POLICIES, polylineLengthM } from '@/liveops/navStuck'
import type { CommandType, RobotState } from '@/types'
import type { Point2D } from '@/types/maps'
import type { NavGoalStatus, NavRouteOption, NavStuck, NavStuckPolicy } from '@/types/robotState'

/**
 * A walk that gets stuck, in demo mode (schema 0.0.27): what the bridge does
 * when Nav2 cannot get the robot to its goal, so the card, the routes on the
 * map and the setting can all be tried without a robot.
 *
 * Start one from the browser console:
 * `window.roverhubMock.simulateStuckWalk()` (Rex, by default). The robot is
 * placed on the Venue survey, walks toward a goal 5.7 m away (the distance of
 * the 2026-11-17 walk that turned on the spot), and after about 2 m gets stuck
 * with two other routes, A and B, and the way back. Then the robot's setting
 * decides, as on the bridge: ask waits a minute for NAV_RESOLVE (and ends
 * `aborted / stuck_timeout` without one), auto takes the shortest route at
 * once (a second stuck on the same walk ends it), stop ends it `aborted` with
 * the routes kept on the final status.
 */

export const MOCK_STUCK_ROBOT = 'zaezae-x1-002'
/** The minute "ask" waits, as the bridge's. */
export const MOCK_DECIDE_MS = 60_000
const TICK_MS = 250
const SPEED_MPS = 0.45
/** Metres walked before it gets stuck. */
const STUCK_AFTER_M = 2.2
/** Seconds per metre in the routes' estimates (the walk's cruise). */
const EST_MPS = 0.35

const round = (v: number) => Math.round(v * 100) / 100

/** A gentle arc from `a` to `b`, bowed `off` metres to the left of the way
 * (negative: right). Rounded to the centimetre, as the bridge publishes it. */
export function bowRoute(a: Point2D, b: Point2D, off: number, samples = 18): Point2D[] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const d = Math.hypot(dx, dy)
  if (d === 0) return [a, b]
  // A quadratic curve's middle sits halfway to its control point.
  const cx = (a[0] + b[0]) / 2 - (dy / d) * off * 2
  const cy = (a[1] + b[1]) / 2 + (dx / d) * off * 2
  const out: Point2D[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, u = 1 - t
    out.push([round(u * u * a[0] + 2 * u * t * cx + t * t * b[0]), round(u * u * a[1] + 2 * u * t * cy + t * t * b[1])])
  }
  return out
}

/** A heading as RobotPosition carries it: degrees anticlockwise from +x, 0-360. */
const headingOf = (dx: number, dy: number) => (((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 360

/** Where `m` metres along `points` is, and which way the line runs there. */
export function pointAlong(points: readonly Point2D[], m: number): { at: Point2D; headingDeg: number; done: boolean } {
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i]
    const seg = Math.hypot(bx - ax, by - ay)
    const heading = headingOf(bx - ax, by - ay)
    if (walked + seg >= m && seg > 0) {
      const t = (m - walked) / seg
      return { at: [round(ax + (bx - ax) * t), round(ay + (by - ay) * t)], headingDeg: heading, done: false }
    }
    walked += seg
  }
  const last = points[points.length - 1]
  const prev = points[points.length - 2] ?? last
  return { at: last, headingDeg: headingOf(last[0] - prev[0], last[1] - prev[1]), done: true }
}

function option(id: string, points: Point2D[]): NavRouteOption {
  const length = round(polylineLengthM(points))
  return { option_id: id, points, length_m: length, est_s: Math.round(length / EST_MPS), end: points[points.length - 1] }
}

interface Walk {
  goalId: string
  start: Point2D
  goal: Point2D
  /** The line being walked now, and how far along it. */
  route: Point2D[]
  progress: number
  /** The route offered and taken, after a stuck; null for the first plan or a retry. */
  taking: string | null
  /** Times it got stuck. */
  stuckCount: number
  stuck: NavStuck | null
  waiting: boolean
  tick: ReturnType<typeof setInterval> | null
  deadline: ReturnType<typeof setTimeout> | null
}

export interface StuckWalkHost {
  getRobot: (robotId: string) => RobotState | undefined
  patchRobot: (robotId: string, patch: Partial<RobotState>) => void
}

export class MockStuckWalks {
  private walks = new Map<string, Walk>()
  private seq = 0

  constructor(private host: StuckWalkHost) {}

  /** Start a walk on `robotId` that will get stuck. Returns its goal id. */
  start(robotId: string = MOCK_STUCK_ROBOT): string {
    const robot = this.host.getRobot(robotId)
    if (!robot) throw new Error(`no mock robot ${robotId}`)
    this.stop(robotId)
    const start: Point2D = [round(robot.position.x_m), round(robot.position.y_m)]
    const goal: Point2D = [round(start[0] + 5.7), start[1]]
    const goalId = `mock-goal-${++this.seq}`
    const walk: Walk = {
      goalId, start, goal, route: bowRoute(start, goal, 0.25), progress: 0, taking: null,
      stuckCount: 0, stuck: null, waiting: false, tick: null, deadline: null,
    }
    this.walks.set(robotId, walk)
    this.host.patchRobot(robotId, {
      position: { ...robot.position, provider: 'slam', quality: 'localized', freshness: 'live', updated_at: new Date().toISOString() },
      sdk_state: 'walk', abstract_state: 'MANUAL', control_owner: `nav:${goalId}`,
      nav_goal: this.status(walk, 'active', null),
    })
    walk.tick = setInterval(() => this.step(robotId), TICK_MS)
    return goalId
  }

  /** The line the robot walks now, for the mock nav/path: null while stuck or idle. */
  routeOf(robotId: string): Point2D[] | null {
    const walk = this.walks.get(robotId)
    return walk && !walk.waiting ? walk.route : null
  }

  /** Why the mock bridge refuses NAV_RESOLVE or SET_NAV_STUCK_POLICY, or null. */
  refusal(robotId: string, type: CommandType, params?: Record<string, unknown>): string | null {
    if (type === 'SET_NAV_STUCK_POLICY') {
      return NAV_STUCK_POLICIES.includes(params?.policy as NavStuckPolicy)
        ? null : 'REJECTED_INVALID_PARAMS: policy must be ask, auto or stop'
    }
    if (type !== 'NAV_RESOLVE') return null
    const choice = params?.choice
    if (typeof params?.goal_id !== 'string' || (choice !== 'route' && choice !== 'retry' && choice !== 'cancel')) {
      return 'REJECTED_INVALID_PARAMS: NAV_RESOLVE needs goal_id and a choice of route, retry or cancel'
    }
    const walk = this.walks.get(robotId)
    if (!walk || !walk.waiting || walk.goalId !== params.goal_id) return 'REJECTED_NAV_NOT_STUCK: the walk is not waiting for a choice'
    if (choice === 'route' && !this.offered(walk).some((o) => o.option_id === params.option_id)) {
      return `REJECTED_NAV_UNKNOWN_OPTION: ${String(params.option_id)} is not one of the routes offered`
    }
    return null
  }

  /** A command the mock bridge completed. */
  apply(robotId: string, type: CommandType, params?: Record<string, unknown>): void {
    if (type === 'SET_NAV_STUCK_POLICY') {
      this.host.patchRobot(robotId, { nav_stuck_policy: params?.policy as NavStuckPolicy })
      return
    }
    const walk = this.walks.get(robotId)
    if (!walk) return
    if (type === 'NAV_CANCEL') this.end(robotId, 'canceled', 'operator', false)
    if (type === 'ESTOP') this.end(robotId, 'aborted', 'estop', false)
    if (type !== 'NAV_RESOLVE' || !walk.waiting) return
    if (params?.choice === 'cancel') this.end(robotId, 'canceled', 'operator', false)
    else if (params?.choice === 'retry') this.walkOn(robotId, walk, null, bowRoute(this.at(robotId) ?? walk.start, walk.goal, 0.25))
    else {
      const chosen = this.offered(walk).find((o) => o.option_id === params?.option_id)
      if (chosen) this.walkOn(robotId, walk, chosen.option_id, chosen.points)
    }
  }

  stop(robotId: string): void {
    const walk = this.walks.get(robotId)
    if (!walk) return
    if (walk.tick) clearInterval(walk.tick)
    if (walk.deadline) clearTimeout(walk.deadline)
    this.walks.delete(robotId)
  }

  dispose(): void {
    for (const id of [...this.walks.keys()]) this.stop(id)
  }

  private offered(walk: Walk): NavRouteOption[] {
    const s = walk.stuck
    return s ? [...s.routes, ...(s.nearest ? [s.nearest] : []), ...(s.back ? [s.back] : [])] : []
  }

  private at(robotId: string): Point2D | null {
    const p = this.host.getRobot(robotId)?.position
    return p ? [p.x_m, p.y_m] : null
  }

  private status(walk: Walk, state: NavGoalStatus['state'], reason: string | null): NavGoalStatus {
    return {
      goal_id: walk.goalId, x_m: walk.goal[0], y_m: walk.goal[1], yaw_rad: null, map_id: 'map-venue-survey',
      state, reason, updated_at: new Date().toISOString(), stuck: walk.stuck,
    }
  }

  private step(robotId: string): void {
    const walk = this.walks.get(robotId)
    const robot = this.host.getRobot(robotId)
    if (!walk || !robot || walk.waiting) return
    walk.progress += SPEED_MPS * (TICK_MS / 1000)
    const firstPlan = walk.taking === null && walk.stuckCount === 0
    if (firstPlan && walk.progress >= STUCK_AFTER_M) {
      this.getStuck(robotId, walk)
      return
    }
    const { at, headingDeg, done } = pointAlong(walk.route, walk.progress)
    this.host.patchRobot(robotId, {
      position: { ...robot.position, x_m: at[0], y_m: at[1], heading_deg: headingDeg, updated_at: new Date().toISOString() },
    })
    if (done) {
      if (walk.taking === 'back') this.end(robotId, 'canceled', 'operator', false)
      else this.end(robotId, 'succeeded', null, false)
    }
  }

  private getStuck(robotId: string, walk: Walk): void {
    const robot = this.host.getRobot(robotId)
    if (!robot) return
    walk.stuckCount++
    const stuckAt: Point2D = [round(robot.position.x_m), round(robot.position.y_m)]
    const now = Date.now()
    const policy = robot.nav_stuck_policy ?? 'ask'
    walk.stuck = {
      reason: 'no_progress',
      since: new Date(now).toISOString(),
      decide_by: policy === 'ask' ? new Date(now + MOCK_DECIDE_MS).toISOString() : null,
      failed_route: walk.route,
      stuck_at: stuckAt,
      routes: [option('A', bowRoute(stuckAt, walk.goal, 1.6)), option('B', bowRoute(stuckAt, walk.goal, -2.6))],
      nearest: null,
      back: option('back', bowRoute(stuckAt, walk.start, 0.1, 8)),
    }
    if (policy === 'stop') {
      this.end(robotId, 'aborted', 'no_progress', true)
      return
    }
    if (policy === 'auto') {
      // One alternative per walk: the shortest route, else the nearest point.
      if (walk.stuckCount > 1) { this.end(robotId, 'aborted', 'no_progress', true); return }
      const best = [...walk.stuck.routes].sort((a, b) => a.length_m - b.length_m)[0] ?? walk.stuck.nearest
      if (best) { this.walkOn(robotId, walk, best.option_id, best.points); return }
      this.end(robotId, 'aborted', 'no_progress', true)
      return
    }
    walk.waiting = true
    this.host.patchRobot(robotId, { sdk_state: 'balance_stand', nav_goal: this.status(walk, 'stuck', null) })
    walk.deadline = setTimeout(() => this.end(robotId, 'aborted', 'stuck_timeout', true), MOCK_DECIDE_MS)
  }

  /** Walk on along `route` (a chosen option, or a fresh plan for Retry): the
   * same goal, active again. */
  private walkOn(robotId: string, walk: Walk, taking: string | null, route: Point2D[]): void {
    if (walk.deadline) clearTimeout(walk.deadline)
    walk.deadline = null
    walk.waiting = false
    walk.taking = taking ?? 'retry'
    walk.route = route
    walk.progress = 0
    walk.stuck = null
    this.host.patchRobot(robotId, { sdk_state: 'walk', nav_goal: this.status(walk, 'active', null) })
  }

  /** The walk is over; `keepStuck` leaves the routes on the final status. */
  private end(robotId: string, state: NavGoalStatus['state'], reason: string | null, keepStuck: boolean): void {
    const walk = this.walks.get(robotId)
    if (!walk) return
    if (!keepStuck) walk.stuck = null
    const robot = this.host.getRobot(robotId)
    this.host.patchRobot(robotId, {
      nav_goal: this.status(walk, state, reason),
      sdk_state: 'balance_stand', abstract_state: 'STAND',
      control_owner: robot?.control_owner === `nav:${walk.goalId}` ? null : robot?.control_owner ?? null,
    })
    this.stop(robotId)
  }
}

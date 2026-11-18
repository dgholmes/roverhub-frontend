import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RobotState } from '@/types'
import { initialRobots } from './mockRobots'
import { MOCK_DECIDE_MS, MOCK_STUCK_ROBOT, MockStuckWalks, bowRoute, pointAlong } from './mockStuckWalk'
import { readNavGoal } from '@/liveops/navGoal'
import { stuckRoutes } from '@/liveops/navStuck'

let robots: RobotState[]
let walks: MockStuckWalks
const rex = () => robots.find((r) => r.robot_id === MOCK_STUCK_ROBOT)!

beforeEach(() => {
  vi.useFakeTimers()
  robots = initialRobots.map((r) => ({ ...r }))
  walks = new MockStuckWalks({
    getRobot: (id) => robots.find((r) => r.robot_id === id),
    patchRobot: (id, patch) => { robots = robots.map((r) => (r.robot_id === id ? { ...r, ...patch } : r)) },
  })
})
afterEach(() => {
  walks.dispose()
  vi.useRealTimers()
})

/** Start a walk and run it until it gets stuck. */
function stuckWalk(policy: RobotState['nav_stuck_policy'] = 'ask'): string {
  robots = robots.map((r) => (r.robot_id === MOCK_STUCK_ROBOT ? { ...r, nav_stuck_policy: policy } : r))
  const goalId = walks.start()
  vi.advanceTimersByTime(6000)
  return goalId
}

describe('the demo stuck walk', () => {
  it('places the robot on the map and walks it toward a goal 5.7 m away', () => {
    const goalId = walks.start()
    expect(rex().position.provider).toBe('slam')
    expect(rex().control_owner).toBe(`nav:${goalId}`)
    expect(rex().nav_goal).toMatchObject({ goal_id: goalId, state: 'active', x_m: 7.7, y_m: 1 })
    vi.advanceTimersByTime(1000)
    expect(rex().position.x_m).toBeGreaterThan(2)
    expect(walks.routeOf(MOCK_STUCK_ROBOT)?.length).toBeGreaterThan(2)
  })

  it('gets stuck with routes A and B and the way back, all well-formed, and waits a minute', () => {
    const goalId = stuckWalk()
    const goal = readNavGoal(rex().nav_goal)!
    expect(goal.state).toBe('stuck')
    expect(goal.stuck?.reason).toBe('no_progress')
    expect(stuckRoutes(goal.stuck!).map((r) => r.id)).toEqual(['A', 'B', 'back'])
    expect(goal.stuck!.routes[0].length_m).toBeLessThan(goal.stuck!.routes[1].length_m)
    expect(Date.parse(goal.stuck!.decide_by!) - Date.parse(goal.stuck!.since)).toBe(MOCK_DECIDE_MS)
    expect(walks.routeOf(MOCK_STUCK_ROBOT)).toBeNull()
    vi.advanceTimersByTime(MOCK_DECIDE_MS)
    expect(rex().nav_goal).toMatchObject({ goal_id: goalId, state: 'aborted', reason: 'stuck_timeout' })
    expect(rex().nav_goal?.stuck?.routes).toHaveLength(2)
    expect(rex().control_owner).toBeNull()
  })

  it('refuses an answer for another walk, an unknown route, or a walk not waiting', () => {
    const goalId = stuckWalk()
    expect(walks.refusal(MOCK_STUCK_ROBOT, 'NAV_RESOLVE', { goal_id: 'other', choice: 'retry' })).toMatch(/^REJECTED_NAV_NOT_STUCK/)
    expect(walks.refusal(MOCK_STUCK_ROBOT, 'NAV_RESOLVE', { goal_id: goalId, choice: 'route', option_id: 'C' })).toMatch(/^REJECTED_NAV_UNKNOWN_OPTION/)
    expect(walks.refusal(MOCK_STUCK_ROBOT, 'NAV_RESOLVE', { goal_id: goalId, choice: 'jump' })).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(walks.refusal(MOCK_STUCK_ROBOT, 'NAV_RESOLVE', { goal_id: goalId, choice: 'route', option_id: 'B' })).toBeNull()
    expect(walks.refusal('zaezae-x1-001', 'NAV_RESOLVE', { goal_id: goalId, choice: 'cancel' })).toMatch(/^REJECTED_NAV_NOT_STUCK/)
  })

  it('walks the chosen route through its points, same goal, and arrives', () => {
    const goalId = stuckWalk()
    const b = rex().nav_goal!.stuck!.routes[1]
    walks.apply(MOCK_STUCK_ROBOT, 'NAV_RESOLVE', { goal_id: goalId, choice: 'route', option_id: 'B' })
    expect(rex().nav_goal).toMatchObject({ goal_id: goalId, state: 'active', stuck: null })
    expect(walks.routeOf(MOCK_STUCK_ROBOT)).toEqual(b.points)
    vi.advanceTimersByTime(60_000)
    expect(rex().nav_goal).toMatchObject({ goal_id: goalId, state: 'succeeded' })
  })

  it('cancels from stuck, and Stop or E-Stop end a walk at any point', () => {
    const goalId = stuckWalk()
    walks.apply(MOCK_STUCK_ROBOT, 'NAV_RESOLVE', { goal_id: goalId, choice: 'cancel' })
    expect(rex().nav_goal).toMatchObject({ state: 'canceled', reason: 'operator', stuck: null })
    walks.start()
    walks.apply(MOCK_STUCK_ROBOT, 'ESTOP')
    expect(rex().nav_goal).toMatchObject({ state: 'aborted', reason: 'estop' })
  })

  it('stop: ends at once with the routes kept; auto: takes the shortest at once', () => {
    stuckWalk('stop')
    expect(rex().nav_goal).toMatchObject({ state: 'aborted', reason: 'no_progress' })
    expect(rex().nav_goal?.stuck?.routes.map((r) => r.option_id)).toEqual(['A', 'B'])
    stuckWalk('auto')
    expect(rex().nav_goal).toMatchObject({ state: 'active', stuck: null })
    // A, the shorter: it bows to the left of the way, ending at the goal.
    const taken = walks.routeOf(MOCK_STUCK_ROBOT)!
    const { x_m, y_m } = rex().nav_goal!
    expect(taken[taken.length - 1]).toEqual([x_m, y_m])
    expect(taken[Math.floor(taken.length / 2)][1]).toBeGreaterThan(y_m + 0.5)
  })

  it('keeps the setting it is sent, and refuses one it does not know', () => {
    expect(walks.refusal(MOCK_STUCK_ROBOT, 'SET_NAV_STUCK_POLICY', { policy: 'maybe' })).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(walks.refusal(MOCK_STUCK_ROBOT, 'SET_NAV_STUCK_POLICY', { policy: 'stop' })).toBeNull()
    walks.apply(MOCK_STUCK_ROBOT, 'SET_NAV_STUCK_POLICY', { policy: 'stop' })
    expect(rex().nav_stuck_policy).toBe('stop')
  })
})

describe('route helpers', () => {
  it('bows a route to the left for a positive offset, right for a negative one', () => {
    const left = bowRoute([0, 0], [4, 0], 1)
    const right = bowRoute([0, 0], [4, 0], -1)
    expect(left[9][1]).toBeCloseTo(1, 1)
    expect(right[9][1]).toBeCloseTo(-1, 1)
    expect(left[0]).toEqual([0, 0])
    expect(left[left.length - 1]).toEqual([4, 0])
  })

  it('finds a point along a line and says when the line is done', () => {
    expect(pointAlong([[0, 0], [2, 0], [2, 2]], 3)).toEqual({ at: [2, 1], headingDeg: 90, done: false })
    expect(pointAlong([[0, 0], [2, 0]], 5).done).toBe(true)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {} }
vi.mock('./mqttClient', () => ({ connectBroker: vi.fn(() => fakeClient) }))

import { RealDataProvider } from './realDataProvider'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { MockNavPaths, MOCK_NAV_PATH_MS, mockPlannedRoute } from '@/mocks/mockNavPath'
import type { NavPathSample } from '@/liveops/navPath'
import type { NavGoalStatus, RobotState } from '@/types'

/** The planned route through the real provider: `roverhub/{site}/{robot}/nav/path`
 * in, the latest frame per robot out (schema 0.0.24). */

const frame = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', map_id: 'map-office', goal_id: 'goal-1',
  captured_at: '2026-11-17T05:00:00Z', points: [[1, 2], [3, 4]], length_m: 2.83, planning_failed: false, ...over,
})

let provider: RealDataProvider
const deliver = (topic: string, payload: unknown) => {
  const onMessage = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
  onMessage?.(topic, Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
  provider = new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000', siteId: 'site-dev' })
})
afterEach(() => {
  provider.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RealDataProvider.subscribeNavPath', () => {
  it('delivers each valid frame for its robot, stamped with when it arrived', () => {
    const got: NavPathSample[] = []
    provider.subscribeNavPath('rover-jetson', (s) => got.push(s))
    vi.setSystemTime(1_000_000)
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame())
    expect(got).toHaveLength(1)
    expect(got[0].frame).toMatchObject({ goal_id: 'goal-1', points: [[1, 2], [3, 4]], length_m: 2.83, planning_failed: false })
    expect(got[0].receivedAt).toBe(1_000_000)
  })

  it('delivers the empty "goal ended" frame too', () => {
    const got: NavPathSample[] = []
    provider.subscribeNavPath('rover-jetson', (s) => got.push(s))
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ points: [], length_m: null }))
    expect(got.map((s) => s.frame.points)).toEqual([[]])
  })

  it('routes by the frame\'s robot, and drops malformed frames', () => {
    const got: NavPathSample[] = []
    provider.subscribeNavPath('rover-jetson', (s) => got.push(s))
    deliver('roverhub/site-dev/rover-pi/nav/path', frame({ robot_id: 'rover-pi' }))
    deliver('roverhub/site-dev/rover-jetson/nav/path', 'not json')
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ points: [[1, Number.NaN]] }))
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ goal_id: '' }))
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ length_m: -2 }))
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ planning_failed: 1 }))
    expect(got).toHaveLength(0)
  })

  it('is not mistaken for another topic, nor another topic for it', () => {
    const got: NavPathSample[] = []
    provider.subscribeNavPath('rover-jetson', (s) => got.push(s))
    deliver('roverhub/site-dev/rover-jetson/scan', frame())
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame())
    expect(got).toHaveLength(1)
    expect(provider.getRobots()).toEqual([])
  })

  it('hands a late subscriber the latest frame at once, and stops after unsubscribe', () => {
    provider.subscribeLinkPhase(() => {})
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ goal_id: 'first' }))
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame({ goal_id: 'second' }))
    const got: NavPathSample[] = []
    const off = provider.subscribeNavPath('rover-jetson', (s) => got.push(s))
    expect(got.map((s) => s.frame.goal_id)).toEqual(['second'])
    off()
    deliver('roverhub/site-dev/rover-jetson/nav/path', frame())
    expect(got).toHaveLength(1)
  })
})

describe('the mock planner', () => {
  const goal = (over: Partial<NavGoalStatus> = {}): NavGoalStatus => ({
    goal_id: 'goal-1', x_m: 6, y_m: 0, yaw_rad: null, map_id: 'map-office', state: 'active', reason: null, updated_at: '', ...over,
  })
  const robot = (nav_goal: NavGoalStatus | null) =>
    ({ robot_id: 'robot-1', site_id: 'site-north-yard', position: { x_m: 0, y_m: 0 }, nav_goal }) as RobotState

  it('bends around something rather than drawing the straight line, from the robot to the goal', () => {
    const route = mockPlannedRoute([0, 0], [6, 0])
    expect(route[0]).toEqual([0, 0])
    expect(route[route.length - 1]).toEqual([6, 0])
    expect(Math.max(...route.map(([, y]) => Math.abs(y)))).toBeGreaterThan(0.5)
  })

  it('plans about once a second while the goal is active, and clears it once when the goal ends', () => {
    let current = robot(goal())
    const sim = new MockNavPaths(() => current)
    const got: NavPathSample[] = []
    const off = sim.subscribe('robot-1', (s) => got.push(s))
    expect(got).toHaveLength(1)
    expect(got[0].frame).toMatchObject({ robot_id: 'robot-1', goal_id: 'goal-1', map_id: 'map-office', planning_failed: false })
    expect(got[0].frame.points.length).toBeGreaterThan(2)
    expect(got[0].frame.length_m).toBeGreaterThan(6)
    vi.advanceTimersByTime(MOCK_NAV_PATH_MS * 2)
    expect(got).toHaveLength(3)
    current = robot(goal({ state: 'succeeded' }))
    vi.advanceTimersByTime(MOCK_NAV_PATH_MS * 3)
    expect(got).toHaveLength(4)
    expect(got[3].frame).toMatchObject({ goal_id: 'goal-1', map_id: 'map-office', points: [], length_m: null })
    off()
    current = robot(goal({ goal_id: 'goal-2' }))
    vi.advanceTimersByTime(MOCK_NAV_PATH_MS * 3)
    expect(got).toHaveLength(4)
    sim.dispose()
  })

  it('sends nothing for a robot with no nav goal', () => {
    const listener = vi.fn()
    const off = mockDataProvider.subscribeNavPath('robot-1', listener)
    vi.advanceTimersByTime(MOCK_NAV_PATH_MS * 5)
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})

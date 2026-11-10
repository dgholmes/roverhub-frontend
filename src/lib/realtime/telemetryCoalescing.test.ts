import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {} as { password?: string } }
vi.mock('./mqttClient', () => ({ connectBroker: vi.fn(() => fakeClient) }))

import { RealDataProvider } from './realDataProvider'
import { TELEMETRY_NOTIFY_INTERVAL_MS } from './notifyCoalescer'
import type { RobotState } from '@/types'

/**
 * Telemetry arrives at ~10 Hz per robot and lower_state at 5 Hz, and every
 * message used to repaint every subscriber. These pin the coalescing: high-rate
 * readings reach subscribers at most every TELEMETRY_NOTIFY_INTERVAL_MS, always
 * as the latest value, while anything discrete -- state, registration,
 * heartbeat, a robot's first appearance -- goes out at once.
 */

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function connected() {
  const provider = new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000', siteId: 'site-dev' })
  const received: RobotState[][] = []
  const unsubscribe = provider.subscribeTelemetry((robots) => received.push(robots))
  const handler = [...fakeClient.on.mock.calls].reverse().find((c) => c[0] === 'message')![1] as (topic: string, payload: Buffer) => void
  const send = (suffix: string, body: Record<string, unknown>) =>
    handler(`roverhub/site-dev/robot-a/${suffix}`, Buffer.from(JSON.stringify(body)))
  const telemetry = (battery: number, extra: Record<string, unknown> = {}) => send('telemetry', {
    robot_id: 'robot-a', site_id: 'site-dev', robot_type: 'quad', pos_body: [battery, 0, 0], vel_body: [0, 0, 0],
    speed_ratio: 40, battery_percent: battery, obstacle_avoidance_enabled: false,
    grpc_freshness: 'live', captured_at: '2026-11-11T00:00:00Z', ...extra,
  })
  const state = (abstract_state: string, extra: Record<string, unknown> = {}) =>
    send('state', { robot_id: 'robot-a', abstract_state, sdk_state: 'walk', ...extra })
  const robot = () => received[received.length - 1]?.[0]
  return { provider, received, unsubscribe, send, telemetry, state, robot }
}

describe('telemetry coalescing', () => {
  it('turns 50 frames in a second into about five repaints, ending on the last frame', () => {
    const { received, telemetry, robot } = connected()
    telemetry(1) // first sight of the robot: immediate
    const before = received.length
    for (let i = 2; i <= 51; i++) {
      telemetry(i)
      vi.advanceTimersByTime(20)
    }
    vi.advanceTimersByTime(TELEMETRY_NOTIFY_INTERVAL_MS)
    const repaints = received.length - before
    expect(repaints).toBeGreaterThanOrEqual(4)
    expect(repaints).toBeLessThanOrEqual(6)
    expect(robot().battery.percent).toBe(51)
  })

  it('never delays the last frame more than one interval', () => {
    const { telemetry, robot } = connected()
    telemetry(10)
    telemetry(11)
    telemetry(12)
    expect(robot().battery.percent).toBe(10)
    vi.advanceTimersByTime(TELEMETRY_NOTIFY_INTERVAL_MS)
    expect(robot().battery.percent).toBe(12)
  })

  it('coalesces lower_state the same way', () => {
    const { received, telemetry, send, robot } = connected()
    telemetry(50)
    vi.advanceTimersByTime(TELEMETRY_NOTIFY_INTERVAL_MS)
    const before = received.length
    for (let i = 0; i < 10; i++) {
      send('lower_state', { robot_id: 'robot-a', imu: {}, motors: [], battery_level: 60 + i })
      vi.advanceTimersByTime(10)
    }
    expect(received.length - before).toBeLessThanOrEqual(2)
    vi.advanceTimersByTime(TELEMETRY_NOTIFY_INTERVAL_MS)
    expect(robot().lowerState?.battery_level).toBe(69)
  })

  it('delivers a state update at once, carrying the newest telemetry with it, never behind it', () => {
    const { received, telemetry, state, robot } = connected()
    telemetry(30)
    telemetry(31) // held for the interval
    const before = received.length
    state('E_STOP')
    expect(received.length).toBe(before + 1)
    expect(robot().abstract_state).toBe('E_STOP')
    expect(robot().battery.percent).toBe(31)
    // The held frame was folded into that delivery; nothing older follows it.
    vi.advanceTimersByTime(TELEMETRY_NOTIFY_INTERVAL_MS * 2)
    expect(received.slice(before).every((robots) => robots[0].abstract_state === 'E_STOP')).toBe(true)
    expect(received.length).toBe(before + 1)
  })

  it('delivers control owner, posture, nav goal and active run changes at once', () => {
    const { received, telemetry, state, robot } = connected()
    telemetry(30)
    telemetry(31)
    const before = received.length
    state('STAND', { control_owner: 'someone-else', posture: 'fallen', active_run: null, nav_goal: null })
    expect(received.length).toBe(before + 1)
    expect(robot().control_owner).toBe('someone-else')
    expect(robot().posture).toBe('fallen')
  })

  it('delivers heartbeat and registration at once', () => {
    const { received, telemetry, send } = connected()
    telemetry(30)
    telemetry(31)
    let before = received.length
    send('heartbeat', { bridge_id: 'b', robot_id: 'robot-a', timestamp: 'now', sdk_connected: false, dds_connected: false, cloud_connected: true })
    expect(received.length).toBe(before + 1)
    before = received.length
    send('register', { robot_id: 'robot-b', site_id: 'site-dev', robot_type: 'wheel', bridge_id: 'b2' })
    expect(received.length).toBe(before + 1)
  })

  it('delivers at once a frame that changes something safety-relevant: the robot link or obstacle avoidance', () => {
    const { received, telemetry, robot } = connected()
    telemetry(30)
    telemetry(31)
    let before = received.length
    telemetry(32, { grpc_freshness: 'stale' })
    expect(received.length).toBe(before + 1)
    expect(robot().connectivity.grpc).not.toBe('connected')
    vi.advanceTimersByTime(TELEMETRY_NOTIFY_INTERVAL_MS)
    before = received.length
    telemetry(33, { grpc_freshness: 'stale', obstacle_avoidance_enabled: true })
    expect(received.length).toBe(before + 1)
    expect(robot().obstacle_avoidance).toBe(true)
  })

  it('clears a pending repaint when the last subscriber leaves, and on dispose', () => {
    const a = connected()
    a.telemetry(30)
    a.telemetry(31)
    a.unsubscribe()
    expect(vi.getTimerCount()).toBe(0)

    const b = connected()
    b.telemetry(30)
    b.telemetry(31)
    b.provider.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

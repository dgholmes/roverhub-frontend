import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn() }

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => fakeClient),
}))

import { RealDataProvider, ROUTINE_ACK_TIMEOUT_MS, SAFETY_ACK_TIMEOUT_MS } from './realDataProvider'
import type { RobotState } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { DRIVE_SPEED_RATIO, DRIVE_TICK_SECONDS } from '@/lib/teleop'
import * as audioPcm from '@/lib/audioPcm'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeProvider() {
  return new RealDataProvider({
    wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000',
    siteId: 'site-dev',
  })
}

/** Drains pending microtasks so a dispatched command has finished registering
 * its ack callback. Counting individual `await Promise.resolve()` ticks coupled
 * these tests to exactly how many awaits `postCommand` happens to contain — it
 * gained one when the POST grew error handling, and four unrelated tests broke.
 * Drain generously instead. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** The provider also issues `GET /robots` on connect (for display names), so a
 * command POST is no longer necessarily `fetch.mock.calls[0]`. Select it by method
 * rather than by position -- which is what these assertions should always have
 * done. */
function postRequestInit(): RequestInit {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
  const post = [...calls].reverse().find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
  if (!post) throw new Error('no POST fetch was made')
  return post[1] as RequestInit
}

describe('RealDataProvider telemetry mapping', () => {
  it('maps an incoming telemetry frame into a RobotState', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    const frame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'wheel',
      pos_body: [1.5, 2.5, 0.0], vel_body: [0.1, 0.0, 0.0],
      speed_ratio: 40, battery_percent: 73.0, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
    }
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(frame)))

    expect(received).toHaveLength(1)
    expect(received[0][0].robot_type).toBe('wheel')
    expect(received[0][0].battery.percent).toBe(73.0)
    expect(received[0][0].position.x_m).toBe(1.5)
    expect(received[0][0].obstacle_avoidance).toBe(false)
    expect(received[0][0].speed_ratio).toBe(40)
  })

  it('maps body-motion, joint, and ground-reaction-force fields onto robot.physics', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    const frame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0],
      acc_body: [0.1, 0, 0], omega_body: [0, 0, 0.2], ori_body: [0, 0.01, 0],
      jpos_leg: [0.5], jvel_leg: [0.1], jtau_leg: [1.5],
      grf_left: [1, 2, 3], grf_right: [4, 5, 6],
      speed_ratio: 40, battery_percent: 73.0, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
    }
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(frame)))

    expect(received[0][0].physics).toEqual({
      acc_body: [0.1, 0, 0], omega_body: [0, 0, 0.2], ori_body: [0, 0.01, 0],
      jpos_leg: [0.5], jvel_leg: [0.1], jtau_leg: [1.5],
      grf_left: [1, 2, 3], grf_right: [4, 5, 6],
    })
  })

  it('ignores unparseable payloads', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from('not json'))
    expect(received).toHaveLength(0)
  })

  it('maps a lower_state message onto an existing robot, leaving it undefined on a robot never seen via telemetry', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]

    const lowerStateFrame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev',
      imu: { quaternion: [1, 0, 0, 0], gyroscope: [0, 0, 0], accelerometer: [0, 0, 9.8], rpy: [0, 0, 0] },
      motors: Array.from({ length: 16 }, (_, i) => ({
        mode: 4, q: i * 0.1, dq: 0, ddq: 0, tau_est: 0, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 30 + i,
      })),
      battery_level: 72,
      captured_at: '2026-07-24T00:00:00Z',
    }

    // Before the robot exists (never seen via telemetry), lower_state must
    // no-op on content -- there's no robot to map onto -- matching
    // handleStateMessage's identical no-op-on-empty-map pattern.
    messageHandler?.('roverhub/site-dev/robot-dev-01/lower_state', Buffer.from(JSON.stringify(lowerStateFrame)))
    expect(received[0]).toEqual([])

    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/telemetry',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
        pos_body: [0, 0, 0], vel_body: [0, 0, 0],
        acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
        jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
        speed_ratio: 0, battery_percent: 80, obstacle_avoidance_enabled: true,
        grpc_freshness: 'live', captured_at: '2026-07-24T00:00:00Z',
      })),
    )
    messageHandler?.('roverhub/site-dev/robot-dev-01/lower_state', Buffer.from(JSON.stringify(lowerStateFrame)))

    const latest = received[received.length - 1][0]
    expect(latest.lowerState?.battery_level).toBe(72)
    expect(latest.lowerState?.motors).toHaveLength(16)
    expect(latest.lowerState?.imu.accelerometer).toEqual([0, 0, 9.8])
  })

  it('preserves lowerState across a subsequent telemetry frame instead of dropping it', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    const telemetryFrame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0],
      acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 0, battery_percent: 80, obstacle_avoidance_enabled: true,
      grpc_freshness: 'live', captured_at: '2026-07-24T00:00:00Z',
    }
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(telemetryFrame)))
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/lower_state',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev',
        imu: { quaternion: [1, 0, 0, 0], gyroscope: [0, 0, 0], accelerometer: [0, 0, 9.8], rpy: [0, 0, 0] },
        motors: Array.from({ length: 16 }, () => ({ mode: 4, q: 0, dq: 0, ddq: 0, tau_est: 0, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 30 })),
        battery_level: 55,
        captured_at: '2026-07-24T00:00:00Z',
      })),
    )

    // A second telemetry frame arrives (~1s later) -- must NOT wipe out lowerState.
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify({ ...telemetryFrame, captured_at: '2026-07-24T00:00:01Z' })))

    const latest = received[received.length - 1][0]
    expect(latest.lowerState?.battery_level).toBe(55)
  })
})

describe('RealDataProvider state and heartbeat mapping', () => {
  it('applies a state message onto an existing robot', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]

    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/telemetry',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
        pos_body: [0, 0, 0], vel_body: [0, 0, 0], speed_ratio: 0,
        battery_percent: 80, obstacle_avoidance_enabled: true,
        grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
      })),
    )
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/state',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev',
        abstract_state: 'STAND', sdk_state: 'balance_stand',
        updated_at: '2026-07-20T00:00:01Z',
      })),
    )

    const latest = received[received.length - 1][0]
    expect(latest.abstract_state).toBe('STAND')
    expect(latest.sdk_state).toBe('balance_stand')
  })

  it('applies a heartbeat message onto connectivity fields', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]

    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/telemetry',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
        pos_body: [0, 0, 0], vel_body: [0, 0, 0], speed_ratio: 0,
        battery_percent: 80, obstacle_avoidance_enabled: true,
        grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
      })),
    )
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/heartbeat',
      Buffer.from(JSON.stringify({
        bridge_id: 'bridge-dev-01', robot_id: 'robot-dev-01', site_id: 'site-dev',
        timestamp: '2026-07-20T00:00:01Z', sdk_connected: false, dds_connected: false,
        cloud_connected: true, battery_pct: 80, mission_active: false,
      })),
    )

    const latest = received[received.length - 1][0]
    expect(latest.connectivity.grpc).toBe('unavailable')
    expect(latest.connectivity.edge_to_cloud).toBe('connected')
  })

  it('does not let a later telemetry frame reset abstract_state set by a state message', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]

    const telemetryFrame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0], speed_ratio: 0,
      battery_percent: 80, obstacle_avoidance_enabled: true,
      grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
    }

    // First telemetry frame -- robot is brand new, so it lands on the
    // interim default of abstract_state: 'STAND'.
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(telemetryFrame)))

    // A state message moves it to a distinctly different abstract_state.
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/state',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev',
        abstract_state: 'MANUAL', sdk_state: 'joystick',
        updated_at: '2026-07-20T00:00:01Z',
      })),
    )

    // A second telemetry frame arrives (~1s later, as in real 1 Hz telemetry)
    // -- it must NOT clobber the abstract_state/sdk_state the state message set.
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/telemetry',
      Buffer.from(JSON.stringify({ ...telemetryFrame, captured_at: '2026-07-20T00:00:02Z' })),
    )

    const latest = received[received.length - 1][0]
    expect(latest.abstract_state).toBe('MANUAL')
    expect(latest.sdk_state).toBe('joystick')
  })
})

describe('RealDataProvider dispatchCommand', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts wired command types to the backend and forwards the initial ack', async () => {
    const requestedCommand = {
      command_id: 'cmd-1', robot_id: 'robot-dev-01', type: 'ESTOP', label: 'E-Stop',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const updates: unknown[] = []
    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (command) => updates.push(command))

    await flushAsync()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/commands'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(updates).toHaveLength(1)
    expect((updates[0] as { current_stage: string }).current_stage).toBe('requested')
  })

  it('delegates unwired command types to mockDataProvider', () => {
    const provider = makeProvider()
    const spy = vi.spyOn(mockDataProvider, 'dispatchCommand')

    provider.dispatchCommand('robot-dev-01', 'PAUSE', 'Pause', () => {})

    expect(spy).toHaveBeenCalledWith('robot-dev-01', 'PAUSE', 'Pause', expect.any(Function), undefined)
    spy.mockRestore()
  })

  it('forwards a later ack message to the callback registered at dispatch time', async () => {
    const requestedCommand = {
      command_id: 'cmd-1', robot_id: 'robot-dev-01', type: 'ESTOP', label: 'E-Stop',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const updates: unknown[] = []
    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (command) => updates.push(command))
    await flushAsync()

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/ack',
      Buffer.from(JSON.stringify({ ...requestedCommand, current_stage: 'execution_completed' })),
    )

    expect(updates).toHaveLength(2)
    expect((updates[1] as { current_stage: string }).current_stage).toBe('execution_completed')
  })
})

/**
 * Before these, a command that never reached the backend produced *no* UI at
 * all: `postCommand` had no try/catch, no `response.ok` check, and was invoked
 * as `void this.postCommand(...)`, so a network failure became an unhandled
 * rejection and the operator saw nothing happen when they pressed E-Stop.
 * A command whose terminal ack never arrived sat at "Sending…" forever.
 * docs/audit/2026-08-12-ui-ux-audit.md A-04/A-05.
 */
describe('RealDataProvider command failure reporting', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  const ack = (command: Record<string, unknown>) => {
    const handler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    handler?.('roverhub/site-dev/robot-dev-01/ack', Buffer.from(JSON.stringify(command)))
  }
  const requested = {
    command_id: 'cmd-1', robot_id: 'robot-dev-01', type: 'ESTOP', label: 'E-Stop',
    stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
  }

  it('reports a failure when the command never reaches the backend', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const provider = makeProvider()
    const updates: { current_stage: string; failure_reason?: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.waitFor(() => expect(updates).toHaveLength(1))

    expect(updates[0].current_stage).toBe('execution_failed')
    expect(updates[0].failure_reason).toBeTruthy()
  })

  it('reports a failure when the backend rejects the command', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) })
    const provider = makeProvider()
    const updates: { current_stage: string; failure_reason?: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.waitFor(() => expect(updates).toHaveLength(1))

    expect(updates[0].current_stage).toBe('execution_failed')
    expect(updates[0].failure_reason).toContain('503')
  })

  it('keeps the failure attributable to the command the operator pressed', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const provider = makeProvider()
    const updates: { robot_id: string; type: string; label: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.waitFor(() => expect(updates).toHaveLength(1))

    expect(updates[0]).toMatchObject({ robot_id: 'robot-dev-01', type: 'ESTOP', label: 'E-Stop' })
  })

  it('times out a safety command whose terminal ack never arrives', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requested) })
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.advanceTimersByTimeAsync(0)
    expect(updates).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(SAFETY_ACK_TIMEOUT_MS)

    expect(updates[updates.length - 1]?.current_stage).toBe('timed_out')
  })

  it('gives a routine command longer than a safety command before timing out', async () => {
    vi.useFakeTimers()
    const routine = { ...requested, command_id: 'cmd-2', type: 'SET_GAIT', label: 'Set Gait' }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(routine) })
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'SET_GAIT', 'Set Gait', (c) => updates.push(c))
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(SAFETY_ACK_TIMEOUT_MS)
    expect(updates[updates.length - 1]?.current_stage).toBe('requested')

    await vi.advanceTimersByTimeAsync(ROUTINE_ACK_TIMEOUT_MS - SAFETY_ACK_TIMEOUT_MS)
    expect(updates[updates.length - 1]?.current_stage).toBe('timed_out')
  })

  it('does not time out a command that completed in time', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requested) })
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.advanceTimersByTimeAsync(0)
    ack({ ...requested, current_stage: 'execution_completed' })

    await vi.advanceTimersByTimeAsync(ROUTINE_ACK_TIMEOUT_MS * 2)

    expect(updates.map((u) => u.current_stage)).toEqual(['requested', 'execution_completed'])
  })

  // A timed-out command must stop being tracked, or a late ack would revive a
  // toast the operator has already been told failed.
  it('ignores an ack that arrives after the command timed out', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requested) })
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SAFETY_ACK_TIMEOUT_MS)
    const afterTimeout = updates.length

    ack({ ...requested, current_stage: 'execution_completed' })

    expect(updates).toHaveLength(afterTimeout)
  })
})

describe('RealDataProvider subscribeEvents', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('emits a real event when a dispatched command completes', async () => {
    const requestedCommand = {
      command_id: 'cmd-evt-1', robot_id: 'robot-dev-01', type: 'SET_GAIT', label: 'Set Gait',
      stages: [{ stage: 'requested', at: '2026-07-23T00:00:00Z' }], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const events: unknown[] = []
    provider.subscribeEvents((e) => events.push(e))
    provider.dispatchCommand('robot-dev-01', 'SET_GAIT', 'Set Gait', () => {}, { gait: 'flying_trot' })
    await flushAsync()

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/ack',
      Buffer.from(JSON.stringify({
        ...requestedCommand,
        current_stage: 'execution_completed',
        stages: [...requestedCommand.stages, { stage: 'execution_completed', at: '2026-07-23T00:00:01Z' }],
      })),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ severity: 'info', message: 'Set Gait completed', command_id: 'cmd-evt-1' })
  })

  it('emits a fault-severity event including failure_reason when a command fails', async () => {
    const requestedCommand = {
      command_id: 'cmd-evt-2', robot_id: 'robot-dev-01', type: 'SET_STATE', label: 'Set State',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const events: unknown[] = []
    provider.subscribeEvents((e) => events.push(e))
    provider.dispatchCommand('robot-dev-01', 'SET_STATE', 'Set State', () => {}, { state: 'walk' })
    await flushAsync()

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/ack',
      Buffer.from(JSON.stringify({
        ...requestedCommand, current_stage: 'execution_failed', failure_reason: 'unknown state: walk',
      })),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ severity: 'fault', message: 'Set State failed: unknown state: walk' })
  })

  it('does not emit an event for driveRobot bursts', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        command_id: 'cmd-drive-evt', robot_id: 'robot-dev-01', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
        stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
      }),
    })

    const provider = makeProvider()
    const events: unknown[] = []
    provider.subscribeEvents((e) => events.push(e))
    provider.driveRobot('robot-dev-01', 0.5, 0, 0)
    await flushAsync()

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/ack',
      Buffer.from(JSON.stringify({
        command_id: 'cmd-drive-evt', robot_id: 'robot-dev-01', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
        stages: [], current_stage: 'execution_completed', initiated_by: 'operator-dev',
      })),
    )

    expect(events).toHaveLength(0)
  })
})

describe('RealDataProvider expanded command coverage', () => {
  it('routes all newly-wired command types through the real POST path', async () => {
    const requestedCommand = {
      command_id: 'cmd-1', robot_id: 'robot-dev-01', type: 'LINE_WALK', label: 'Walk forward',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const updates: unknown[] = []
    provider.dispatchCommand('robot-dev-01', 'LINE_WALK', 'Walk forward', (command) => updates.push(command), { direction: 'forward', distance: 1.0 })

    await flushAsync()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/commands'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(updates).toHaveLength(1)
  })

  it('routes SET_GAIT through the real POST path instead of falling back to mockDataProvider', async () => {
    const requestedCommand = {
      command_id: 'cmd-gait-1', robot_id: 'robot-dev-01', type: 'SET_GAIT', label: 'Set Gait',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })
    const spy = vi.spyOn(mockDataProvider, 'dispatchCommand')

    const provider = makeProvider()
    provider.dispatchCommand('robot-dev-01', 'SET_GAIT', 'Set Gait', () => {}, { gait: 'flying_trot' })

    await flushAsync()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/commands'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('still delegates a genuinely unwired type (PAUSE) to mockDataProvider', () => {
    const provider = makeProvider()
    const spy = vi.spyOn(mockDataProvider, 'dispatchCommand')

    provider.dispatchCommand('robot-dev-01', 'PAUSE', 'Pause', () => {})

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('RealDataProvider uploadAudioClip', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // decodeToRobotPcm uses AudioContext/OfflineAudioContext, which this node test
  // environment has no implementation of, so it is stubbed. Its own maths is
  // covered directly in lib/audioPcm.test.ts.
  function stubDecoder() {
    return vi.spyOn(audioPcm, 'decodeToRobotPcm').mockResolvedValue({
      pcm: new ArrayBuffer(96_000), // 2s at 24kHz/16-bit
      durationSeconds: 2,
      sourceSampleRateHz: 44_100,
      sourceChannels: 2,
    })
  }

  it('uploads decoded PCM to the audio-clips endpoint and returns clip_id', async () => {
    // clip_id is what SPEAK carries. file_path was the old contract and could
    // never work: it names a file on the cloud's disk, and the robot resolves
    // file playback against its own, so the audio never reached it.
    const decode = stubDecoder()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ clip_id: 'robot-dev-01-abc123.pcm', file_path: '/srv/clips/x.pcm' }),
    })

    const provider = makeProvider()
    const file = new File(['fake-audio-bytes'], 'clip.mp3', { type: 'audio/mpeg' })
    const result = await provider.uploadAudioClip('robot-dev-01', file)

    expect(decode).toHaveBeenCalledWith(file)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/audio-clips'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
    expect(result.clip_id).toBe('robot-dev-01-abc123.pcm')
  })

  it('sends the clip as audio/pcm, since the backend derives the stored type from it', async () => {
    stubDecoder()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ clip_id: 'c.pcm' }) })

    const provider = makeProvider()
    await provider.uploadAudioClip('robot-dev-01', new File(['x'], 'clip.mp3', { type: 'audio/mpeg' }))

    const body = (global.fetch as unknown as { mock: { calls: [string, { body: FormData }][] } })
      .mock.calls[0][1].body
    const uploaded = body.get('file') as Blob
    expect(uploaded.type).toBe('audio/pcm')
    expect(uploaded.size).toBe(96_000)
  })

  it('throws when the upload endpoint responds with a non-ok status', async () => {
    stubDecoder()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 413 })

    const provider = makeProvider()
    const file = new File(['x'], 'clip.mp3', { type: 'audio/mpeg' })

    await expect(provider.uploadAudioClip('robot-dev-01', file)).rejects.toThrow('413')
  })

  it('surfaces a decode failure rather than uploading an undecodable file', async () => {
    // Failing here, in the browser, is the point: the operator gets a clear
    // message instead of silence somewhere on an edge device.
    vi.spyOn(audioPcm, 'decodeToRobotPcm').mockRejectedValue(new Error('Could not decode that audio file.'))
    global.fetch = vi.fn()

    const provider = makeProvider()
    await expect(
      provider.uploadAudioClip('robot-dev-01', new File(['x'], 'clip.xyz', { type: 'audio/mpeg' })),
    ).rejects.toThrow('Could not decode')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('RealDataProvider driveRobot', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFetchResolving(command: Record<string, unknown>) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(command) })
  }

  it('posts a VELOCITY_SEQUENCE command with one step matching the tick duration', async () => {
    const requestedCommand = {
      command_id: 'cmd-drive-1', robot_id: 'robot-dev-01', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = mockFetchResolving(requestedCommand)

    const provider = makeProvider()
    provider.driveRobot('robot-dev-01', 0.5, -0.2, 0.1)
    await Promise.resolve()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/commands'),
      expect.objectContaining({ method: 'POST' }),
    )
    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    expect(body.type).toBe('VELOCITY_SEQUENCE')
    expect(body.params.steps).toEqual([[0.5, -0.2, 0.1, DRIVE_TICK_SECONDS]])
    expect(body.params.speed_ratio).toBe(DRIVE_SPEED_RATIO)
  })

  it('uses the caller-supplied speedRatio instead of the DRIVE_SPEED_RATIO default', async () => {
    const requestedCommand = {
      command_id: 'cmd-drive-ratio', robot_id: 'robot-dev-01', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = mockFetchResolving(requestedCommand)

    const provider = makeProvider()
    provider.driveRobot('robot-dev-01', 0.5, 0, 0, 100)
    await Promise.resolve()

    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    expect(body.params.speed_ratio).toBe(100)
  })

  it('falls back to DRIVE_SPEED_RATIO when no speedRatio is supplied', async () => {
    const requestedCommand = {
      command_id: 'cmd-drive-ratio-default', robot_id: 'robot-dev-01', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = mockFetchResolving(requestedCommand)

    const provider = makeProvider()
    provider.driveRobot('robot-dev-01', 0, 0, 0)
    await Promise.resolve()

    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    expect(body.params.speed_ratio).toBe(DRIVE_SPEED_RATIO)
  })

  it('defaults gait to walk for a robot this provider has never seen telemetry for', async () => {
    global.fetch = mockFetchResolving({
      command_id: 'cmd-drive-2', robot_id: 'unknown-robot', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    })

    const provider = makeProvider()
    provider.driveRobot('unknown-robot', 0, 0, 0)
    await Promise.resolve()

    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    expect(body.params.gait).toBe('walk')
  })

  it("uses the robot's current gait (from prior telemetry) instead of the walk default", async () => {
    global.fetch = mockFetchResolving({
      command_id: 'cmd-drive-3', robot_id: 'robot-dev-01', type: 'VELOCITY_SEQUENCE', label: 'Manual Drive',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    })

    const provider = makeProvider()
    // Simulate a robot already known to this provider with a non-default
    // gait -- there's no public setter for this (gait only ever arrives via
    // telemetry's carry-forward default today), so reach into the internal
    // robots list the way telemetry mapping already populates it.
    ;(provider as unknown as { robots: RobotState[] }).robots = [
      {
        robot_id: 'robot-dev-01', name: 'Dev Robot', site_id: 'site-dev', robot_type: 'quad',
        abstract_state: 'MANUAL', sdk_state: 'joystick',
        battery: { percent: 80, est_runtime_min: 0, charging: false },
        position: { x_m: 0, y_m: 0, heading_deg: 0, provider: 'dead_reckoning', freshness: 'live', updated_at: '2026-07-20T00:00:00Z' },
        speed_mps: 0, speed_ratio: 60, gait: 'flying_trot', obstacle_avoidance: true,
        connectivity: {
          robot_to_edge: 'connected', edge_to_cloud: 'connected', bridge_state: 'connected',
          bridge_latency_ms: null, dds: 'connected', grpc: 'connected',
        },
        maintenance_flagged: false, control_owner: 'operator-dev', available_motions: [],
        updated_at: '2026-07-20T00:00:00Z',
      },
    ]

    provider.driveRobot('robot-dev-01', 0.2, 0, 0)
    await Promise.resolve()

    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    expect(body.params.gait).toBe('flying_trot')
  })
})

describe('RealDataProvider available_motions', () => {
  it('captures available_motions from a heartbeat message', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]

    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/telemetry',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
        pos_body: [0, 0, 0], vel_body: [0, 0, 0], speed_ratio: 0,
        battery_percent: 80, obstacle_avoidance_enabled: true,
        grpc_freshness: 'live', captured_at: '2026-07-21T00:00:00Z',
      })),
    )
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/heartbeat',
      Buffer.from(JSON.stringify({
        bridge_id: 'bridge-dev-01', robot_id: 'robot-dev-01', site_id: 'site-dev',
        timestamp: '2026-07-21T00:00:01Z', sdk_connected: true, dds_connected: false,
        cloud_connected: true, battery_pct: 80, mission_active: false,
        available_motions: ['walk', 'dance', 'wave'],
      })),
    )

    const latest = received[received.length - 1][0]
    expect(latest.available_motions).toEqual(['walk', 'dance', 'wave'])
  })
})

describe('RealDataProvider gait resolution', () => {
  function telemetryFrame(robot_type: 'quad' | 'wheel') {
    return {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type,
      pos_body: [0, 0, 0], vel_body: [0, 0, 0],
      acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 0, battery_percent: 80, obstacle_avoidance_enabled: true,
      grpc_freshness: 'live', captured_at: '2026-08-04T00:00:00Z',
    }
  }

  function setup(robot_type: 'quad' | 'wheel') {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/telemetry',
      Buffer.from(JSON.stringify(telemetryFrame(robot_type))),
    )
    const latest = () => received[received.length - 1][0]
    return { provider, messageHandler, latest }
  }

  it('defaults a wheel robot gait to wheel_loco before any /state arrives', () => {
    // Regression guard: this was hardcoded `?? 'walk'`, a gait no wheel robot
    // can perform -- so the very first drive burst was always invalid.
    expect(setup('wheel').latest().gait).toBe('wheel_loco')
  })

  it('defaults a quad robot gait to walk before any /state arrives', () => {
    expect(setup('quad').latest().gait).toBe('walk')
  })

  it('takes gait from the /state topic, which owns it', () => {
    const { messageHandler, latest } = setup('wheel')
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/state',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', abstract_state: 'MANUAL', sdk_state: 'wheel_loco',
        gait: 'wheel_loco', robot_type: 'wheel', updated_at: '2026-08-04T00:00:00Z',
      })),
    )
    expect(latest().gait).toBe('wheel_loco')
    expect(latest().sdk_state).toBe('wheel_loco')
  })

  it('keeps the existing gait when an older bridge omits it from /state', () => {
    const { messageHandler, latest } = setup('wheel')
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/state',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', abstract_state: 'PASSIVE', sdk_state: 'stand_down',
        updated_at: '2026-08-04T00:00:00Z',
      })),
    )
    expect(latest().gait).toBe('wheel_loco')
    expect(latest().robot_type).toBe('wheel')
  })

  it('sends the robot current gait on a drive burst, not a hardcoded walk', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      // A fresh Response per call: a real Response body is single-use, and the
      // provider issues more than one fetch (GET /robots as well as the POST).
      () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    )
    const { provider } = setup('wheel')
    provider.driveRobot('robot-dev-01', 0.5, 0, 0, 60)

    const calls = fetchSpy.mock.calls
    const body = JSON.parse(String(calls[calls.length - 1]?.[1]?.body))
    expect(body.params.gait).toBe('wheel_loco')
    fetchSpy.mockRestore()
  })

  it('sends walk on a drive burst for a quad robot', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      // A fresh Response per call: a real Response body is single-use, and the
      // provider issues more than one fetch (GET /robots as well as the POST).
      () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    )
    const { provider } = setup('quad')
    provider.driveRobot('robot-dev-01', 0.5, 0, 0, 60)

    const calls = fetchSpy.mock.calls
    const body = JSON.parse(String(calls[calls.length - 1]?.[1]?.body))
    expect(body.params.gait).toBe('walk')
    fetchSpy.mockRestore()
  })
})

describe('RealDataProvider gRPC health when the robot is powered off', () => {
  function frame(freshness: 'live' | 'stale' | 'missing') {
    return {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'wheel' as const,
      pos_body: [0, 0, 0], vel_body: [0, 0, 0],
      acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 0, battery_percent: 80, obstacle_avoidance_enabled: true,
      grpc_freshness: freshness, captured_at: '2026-08-05T00:00:00Z',
    }
  }

  function setup() {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    const telemetry = (f: 'live' | 'stale' | 'missing') =>
      send?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(frame(f))))
    const heartbeat = (sdk_connected: boolean) =>
      send?.('roverhub/site-dev/robot-dev-01/heartbeat', Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', sdk_connected, dds_connected: false, cloud_connected: true,
      })))
    const grpc = () => received[received.length - 1][0].connectivity.grpc
    return { telemetry, heartbeat, grpc }
  }

  it('does not let a telemetry frame overwrite the heartbeat offline verdict', () => {
    // The regression: the bridge keeps republishing its last snapshot at 10Hz
    // while the robot is off, and the old mapping asserted 'connected' for any
    // freshness except 'missing'. So the heartbeat's correct 'unavailable'
    // survived ~100ms out of every 5s and the UI read "SDK Connected".
    const { telemetry, heartbeat, grpc } = setup()
    telemetry('live')
    expect(grpc()).toBe('connected')

    heartbeat(false)
    expect(grpc()).toBe('unavailable')

    telemetry('live')
    telemetry('stale')
    telemetry('live')
    expect(grpc()).toBe('unavailable')
  })

  it('lets the heartbeat restore connected once the robot is back', () => {
    const { telemetry, heartbeat, grpc } = setup()
    telemetry('live')
    heartbeat(false)
    expect(grpc()).toBe('unavailable')

    heartbeat(true)
    expect(grpc()).toBe('connected')
  })

  it('degrades from stale telemetry before the next heartbeat is due', () => {
    // Telemetry's value here: freshness crosses stale at 3s, ahead of the 5s
    // heartbeat, so an outage surfaces faster than the heartbeat alone allows.
    const { telemetry, grpc } = setup()
    telemetry('live')
    telemetry('stale')
    expect(grpc()).toBe('degraded')
  })
})

describe('RealDataProvider control ownership', () => {
  function setup() {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      // Fresh Response per call -- see the note in the gait-resolution suite.
      () => Promise.resolve(
        new Response(JSON.stringify({ command_id: 'c1', stages: [], current_stage: 'requested' }), { status: 200 }),
      ),
    )
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    send?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify({
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'wheel',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0],
      acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 0, battery_percent: 80, obstacle_avoidance_enabled: true,
      grpc_freshness: 'live', captured_at: '2026-08-05T00:00:00Z',
    })))
    const owner = () => received[received.length - 1][0].control_owner
    return { provider, owner, fetchSpy }
  }

  it('starts with no control owner', () => {
    // Regression guard: control_owner was only ever `existing ?? null` here, so
    // it stayed null forever -- which silently disabled the drive overlay's
    // auto-release deadman once that was (correctly) gated on ownership.
    const { owner, fetchSpy } = setup()
    expect(owner()).toBeNull()
    fetchSpy.mockRestore()
  })

  it('claims ownership on TAKE_CONTROL', () => {
    const { provider, owner, fetchSpy } = setup()
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', () => {})
    expect(owner()).toBe('operator-dev')
    fetchSpy.mockRestore()
  })

  it('releases ownership on RELEASE_CONTROL', () => {
    const { provider, owner, fetchSpy } = setup()
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', () => {})
    provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release Control', () => {})
    expect(owner()).toBeNull()
    fetchSpy.mockRestore()
  })

  it('does not claim ownership for unrelated commands', () => {
    // Being upright is not the same as holding control -- a wheel robot reports
    // MANUAL merely for being in wheel_loco, which is why mounting the drive
    // surface on abstract_state was wrong.
    const { provider, owner, fetchSpy } = setup()
    provider.dispatchCommand('robot-dev-01', 'SET_STATE', 'Stand', () => {}, { state: 'wheel_loco' })
    expect(owner()).toBeNull()
    fetchSpy.mockRestore()
  })

  it('still POSTs the command after claiming ownership', () => {
    const { provider, fetchSpy } = setup()
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', () => {})
    const calls = fetchSpy.mock.calls
    const body = JSON.parse(String(calls[calls.length - 1]?.[1]?.body))
    expect(body.type).toBe('TAKE_CONTROL')
    expect(body.initiated_by).toBe('operator-dev')
    fetchSpy.mockRestore()
  })
})

/** The reason this provider exists in its current form: it used to be pinned to a
 * single robot by VITE_ROBOT_ID at build time, so a second robot's telemetry was
 * ingested by the backend and returned by GET /robots but could never reach the UI. */
describe('RealDataProvider multi-robot', () => {
  function telemetryFor(robotId: string, robotType: 'quad' | 'wheel', battery: number) {
    return {
      robot_id: robotId, site_id: 'site-dev', robot_type: robotType,
      pos_body: [0, 0, 0], vel_body: [0, 0, 0],
      acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 0, battery_percent: battery, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-08-11T00:00:00Z',
    }
  }

  function connect() {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1] as
      (topic: string, payload: Buffer) => void
    return { provider, received, send }
  }

  it('tracks two robots independently from their telemetry', () => {
    const { send, received } = connect()
    send('roverhub/site-dev/robot-a/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-a', 'quad', 80))))
    send('roverhub/site-dev/robot-b/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-b', 'wheel', 41))))

    const latest = received[received.length - 1]
    expect(latest).toHaveLength(2)
    expect(latest.find((r) => r.robot_id === 'robot-a')?.battery.percent).toBe(80)
    expect(latest.find((r) => r.robot_id === 'robot-b')?.battery.percent).toBe(41)
    // Distinct types must survive -- both robots previously shared one config.
    expect(latest.find((r) => r.robot_id === 'robot-a')?.robot_type).toBe('quad')
    expect(latest.find((r) => r.robot_id === 'robot-b')?.robot_type).toBe('wheel')
  })

  it('names each robot distinctly rather than giving them all one configured name', () => {
    const { send, received } = connect()
    send('roverhub/site-dev/robot-a/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-a', 'quad', 80))))
    send('roverhub/site-dev/robot-b/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-b', 'wheel', 41))))

    const latest = received[received.length - 1]
    const names = latest.map((r) => r.name)
    expect(new Set(names).size).toBe(2)
  })

  it('creates a robot from a retained /state arriving before any telemetry', () => {
    // /state is published retained, so a browser connecting receives it for every
    // robot immediately -- before telemetry. This used to be dropped outright,
    // leaving the UI on the interim 'STAND' default.
    const { send, received } = connect()
    send('roverhub/site-dev/robot-a/state', Buffer.from(JSON.stringify({
      robot_id: 'robot-a', abstract_state: 'PASSIVE', sdk_state: 'passive', robot_type: 'wheel',
    })))

    const latest = received[received.length - 1]
    expect(latest).toHaveLength(1)
    expect(latest[0].abstract_state).toBe('PASSIVE')
    expect(latest[0].robot_type).toBe('wheel')
  })

  it('discovers a robot from a retained bridge registration, before any telemetry', () => {
    const { send, received } = connect()
    send('roverhub/admin/bridge-pi-01/register', Buffer.from(JSON.stringify({
      bridge_id: 'bridge-pi-01', site_id: 'site-dev', robot_id: 'robot-pi', robot_type: 'quad',
    })))

    const latest = received[received.length - 1]
    expect(latest).toHaveLength(1)
    expect(latest[0].robot_id).toBe('robot-pi')
    // Registered but silent: must read as offline, not as a healthy idle robot.
    expect(latest[0].connectivity.grpc).toBe('unavailable')
    expect(latest[0].position.freshness).toBe('missing')
  })

  it('keeps robot order stable across telemetry frames', () => {
    // The displayed robot used to flip several times a second with two robots:
    // handleTelemetryMessage did `[nextState, ...others]`, moving whichever robot
    // reported last to index 0, and consumers resolve the shown robot as
    // `robots.find(selected) ?? robots[0]`.
    const { send, received } = connect()
    send('roverhub/site-dev/robot-a/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-a', 'quad', 80))))
    send('roverhub/site-dev/robot-b/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-b', 'wheel', 41))))
    const orderAfterDiscovery = received[received.length - 1].map((r) => r.robot_id)

    // Interleave several more frames, as two live bridges would.
    for (let i = 0; i < 4; i++) {
      send('roverhub/site-dev/robot-a/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-a', 'quad', 79 - i))))
      send('roverhub/site-dev/robot-b/telemetry', Buffer.from(JSON.stringify(telemetryFor('robot-b', 'wheel', 40 - i))))
    }

    expect(received[received.length - 1].map((r) => r.robot_id)).toEqual(orderAfterDiscovery)
    // ...and the updates still landed.
    expect(received[received.length - 1].find((r) => r.robot_id === 'robot-b')?.battery.percent).toBe(37)
  })

  it('ignores robots from other sites when a site filter is configured', () => {
    const { send, received } = connect()
    send('roverhub/other-site/robot-x/telemetry', Buffer.from(JSON.stringify({
      ...telemetryFor('robot-x', 'quad', 50), site_id: 'other-site',
    })))
    expect(received).toHaveLength(0)
  })

  it('marks a robot connected once its heartbeat arrives, even if that is the first message', () => {
    const { send, received } = connect()
    send('roverhub/site-dev/robot-a/heartbeat', Buffer.from(JSON.stringify({
      robot_id: 'robot-a', sdk_connected: true, dds_connected: true, cloud_connected: true,
    })))

    const latest = received[received.length - 1]
    expect(latest).toHaveLength(1)
    expect(latest[0].connectivity.grpc).toBe('connected')
    expect(latest[0].connectivity.dds).toBe('connected')
    expect(latest[0].connectivity.bridge_state).toBe('connected')
  })
})

describe('RealDataProvider unknown battery (2026-08-12 audit F1)', () => {
  it('carries a null battery_percent through as null, not 0', () => {
    // gRPC exposes no battery field, so a bridge without DDS BMS publishes
    // null. Coercing that to 0 would render a flat battery on every screen and
    // trip every battery-threshold check.
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify({
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0], acc_body: [0, 0, 0],
      omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 40, battery_percent: null, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-08-12T00:00:00Z',
    })))

    expect(received[received.length - 1][0].battery.percent).toBeNull()
  })

  it('prefers a real DDS BMS reading over the absent gRPC one', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify({
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0], acc_body: [0, 0, 0],
      omega_body: [0, 0, 0], ori_body: [0, 0, 0],
      jpos_leg: [], jvel_leg: [], jtau_leg: [], grf_left: [0, 0, 0], grf_right: [0, 0, 0],
      speed_ratio: 40, battery_percent: 41, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-08-12T00:00:00Z',
    })))

    expect(received[received.length - 1][0].battery.percent).toBe(41)
  })
})

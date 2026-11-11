import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {} as { password?: string } }

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => fakeClient),
}))

import { LOCAL_FAILURE_PREFIX, LOCAL_REJECTED_PREFIX, RealDataProvider, ROUTINE_ACK_TIMEOUT_MS, SAFETY_ACK_TIMEOUT_MS } from './realDataProvider'
import type { MissionLibraryEntry, RobotState, TimelineEvent } from '@/types'
import type { Step } from '@/missions/program/types'
import { RunStartRefused } from './runStart'
import { ackDeadlineMs } from './commandDeadline'
import { ApiError } from './apiError'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { DRIVE_SPEED_RATIO } from '@/lib/teleop'
import * as audioPcm from '@/lib/audioPcm'
import { connectBroker } from './mqttClient'
import { brokerSessionFor } from './brokerSession'
import { DEV_USER } from '@/lib/auth/types'
import { bridgeLiveness } from '@/fleet/bridgeHealth'

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

  it('derives heading from body yaw, the way the bridge does', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    const frame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'quad',
      pos_body: [0, 0, 0], vel_body: [0, 0, 0], ori_body: [0, 0, -Math.PI / 2],
      speed_ratio: 40, battery_percent: null, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
    }
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(frame)))
    expect(received[0][0].position.heading_deg).toBeCloseTo(270)
  })

  it('records bridge identity from the registration and liveness from the heartbeat', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.('roverhub/admin/bridge-x/register', Buffer.from(JSON.stringify({
      bridge_id: 'bridge-x', site_id: 'site-dev', robot_id: 'robot-dev-01', robot_type: 'quad', schema_version: '0.0.8',
    })))
    messageHandler?.('roverhub/site-dev/robot-dev-01/heartbeat', Buffer.from(JSON.stringify({
      bridge_id: 'bridge-x', robot_id: 'robot-dev-01', site_id: 'site-dev', timestamp: '2026-10-13T00:00:05Z',
      sdk_connected: true, dds_connected: false, cloud_connected: true, mission_active: false,
    })))
    const bridge = received[received.length - 1][0].bridge
    expect(bridge?.bridge_id).toBe('bridge-x')
    expect(bridge?.schema_version).toBe('0.0.8')
    expect(bridge?.raw_heartbeat?.timestamp).toBe('2026-10-13T00:00:05Z')
    expect(bridge?.raw_registration?.robot_type).toBe('quad')
  })

  describe('heartbeat liveness uses arrival time, not the device clock', () => {
    // 2026-11-10: the Jetson has no RTC battery and booted 37 min slow. Every
    // heartbeat it sent looked 37 min old, so the console called a running
    // bridge silent until NTP fixed its clock 70 s after boot.
    const NOW = Date.parse('2026-11-10T05:41:30Z')
    const SKEWED = '2026-11-10T05:04:30Z' // 37 min behind
    afterEach(() => vi.useRealTimers())

    const send = (packet?: { retain?: boolean }) => {
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
      const provider = makeProvider()
      const received: RobotState[][] = []
      provider.subscribeTelemetry((robots) => received.push(robots))
      const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
      messageHandler?.('roverhub/site-dev/robot-dev-01/heartbeat', Buffer.from(JSON.stringify({
        bridge_id: 'bridge-x', robot_id: 'robot-dev-01', site_id: 'site-dev', timestamp: SKEWED,
        sdk_connected: true, dds_connected: false, cloud_connected: true,
      })), packet)
      return received[received.length - 1][0].bridge
    }

    it('records when the heartbeat arrived', () => {
      const bridge = send()
      expect(bridge?.last_heartbeat_at).toBe(new Date(NOW).toISOString())
      expect(bridgeLiveness(bridge?.last_heartbeat_at, NOW)).toBe('live')
    })

    it('keeps the device timestamp for a retained heartbeat, which may be stale', () => {
      expect(send({ retain: true })?.last_heartbeat_at).toBe(SKEWED)
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
    const routine = { ...requested, command_id: 'cmd-2', type: 'LED_SIGNAL', label: 'Lights' }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(routine) })
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'LED_SIGNAL', 'Lights', (c) => updates.push(c))
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
  it('applies an ack that arrived before the POST had returned the command id', async () => {
    // Light Off, 2026-10-29: completed on the bridge in ~2 ms, its ack beat the
    // HTTP response, was dropped, and the console reported a timeout.
    vi.useFakeTimers()
    let respond: (value: unknown) => void = () => {}
    global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => { respond = resolve }))
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    ack({ ...requested, current_stage: 'execution_completed' })
    respond({ ok: true, json: () => Promise.resolve(requested) })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SAFETY_ACK_TIMEOUT_MS * 2)

    expect(updates.map((u) => u.current_stage)).toEqual(['requested', 'execution_completed'])
  })

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

  it.each(['timed_out', 'cancelled'])('treats a %s ack as terminal, so the browser deadline never fires after it', async (stage) => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requested) })
    const provider = makeProvider()
    const updates: { current_stage: string }[] = []

    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.advanceTimersByTimeAsync(0)
    ack({ ...requested, current_stage: stage })
    await vi.advanceTimersByTimeAsync(ROUTINE_ACK_TIMEOUT_MS * 2)
    ack({ ...requested, current_stage: 'execution_completed' })

    expect(updates.map((u) => u.current_stage)).toEqual(['requested', stage])
  })

  it('names a command whose POST timed out with the local-failure prefix', async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const provider = makeProvider()
    const updates: { command_id: string }[] = []
    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
    await vi.waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].command_id.startsWith(LOCAL_FAILURE_PREFIX)).toBe(true)
  })

  it('names a command that never reached the backend, or that it refused, with the rejected prefix', async () => {
    for (const fetchMock of [
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }),
    ]) {
      global.fetch = fetchMock
      const provider = makeProvider()
      const updates: { command_id: string }[] = []
      provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (c) => updates.push(c))
      await vi.waitFor(() => expect(updates).toHaveLength(1))
      expect(updates[0].command_id.startsWith(LOCAL_REJECTED_PREFIX)).toBe(true)
    }
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
        command_id: 'cmd-drive-evt', robot_id: 'robot-dev-01', type: 'DRIVE', label: 'Manual Drive',
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
        command_id: 'cmd-drive-evt', robot_id: 'robot-dev-01', type: 'DRIVE', label: 'Manual Drive',
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

  it('routes SNAPSHOT through the real POST path now that the camera works', async () => {
    // SNAPSHOT was excluded for needing "camera DDS plumbing". That exists and is
    // confirmed on hardware, and the bridge captures the frame stream_manager
    // already holds -- so a snapshot is a real command, not a simulated one.
    const requestedCommand = {
      command_id: 'cmd-snap-1', robot_id: 'robot-dev-01', type: 'SNAPSHOT', label: 'Snapshot',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(requestedCommand) })
    const spy = vi.spyOn(mockDataProvider, 'dispatchCommand')

    const provider = makeProvider()
    provider.dispatchCommand('robot-dev-01', 'SNAPSHOT', 'Snapshot', () => {}, { camera: 'front' })

    await flushAsync()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/commands'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('builds a fetchable URL for a captured snapshot', () => {
    // The ack carries only the id; the operator's client needs somewhere to GET
    // the image, and only the provider knows the API base URL.
    const provider = makeProvider()

    expect(provider.snapshotUrl('robot-dev-01-abc.jpg'))
      .toBe('http://localhost:8000/snapshots/robot-dev-01-abc.jpg')
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

  it('posts a DRIVE command carrying the raw velocity setpoint', async () => {
    const requestedCommand = {
      command_id: 'cmd-drive-1', robot_id: 'robot-dev-01', type: 'DRIVE', label: 'Manual Drive',
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
    // DRIVE, not VELOCITY_SEQUENCE: a held setpoint rather than a bounded
    // burst. The bridge owns the resulting sequence -- see velocity_driver.py.
    expect(body.type).toBe('DRIVE')
    expect(body.params).toMatchObject({ vx: 0.5, vy: -0.2, vyaw: 0.1 })
    expect(body.params.steps).toBeUndefined()
    expect(body.params.speed_ratio).toBe(DRIVE_SPEED_RATIO)
  })

  it('uses the caller-supplied speedRatio instead of the DRIVE_SPEED_RATIO default', async () => {
    const requestedCommand = {
      command_id: 'cmd-drive-ratio', robot_id: 'robot-dev-01', type: 'DRIVE', label: 'Manual Drive',
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
      command_id: 'cmd-drive-ratio-default', robot_id: 'robot-dev-01', type: 'DRIVE', label: 'Manual Drive',
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

  it('does not send a gait -- the edge resolves it from the connected hardware', async () => {
    // safety_manager validates rather than substitutes, so a browser-supplied
    // gait aimed at the wrong robot type is REJECTED outright. Sending 'walk'
    // to a wheel robot is exactly how manual control silently did nothing.
    // Omitting it lets the edge pick correctly for either type.
    global.fetch = mockFetchResolving({
      command_id: 'cmd-drive-2', robot_id: 'unknown-robot', type: 'DRIVE', label: 'Manual Drive',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    })

    const provider = makeProvider()
    provider.driveRobot('unknown-robot', 0, 0, 0)
    await Promise.resolve()

    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    expect(body.params.gait).toBeUndefined()
  })

  it('omits gait even when the robot has a known non-default gait', async () => {
    global.fetch = mockFetchResolving({
      command_id: 'cmd-drive-3', robot_id: 'robot-dev-01', type: 'DRIVE', label: 'Manual Drive',
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
        abstract_state: 'MANUAL', posture: 'upright', sdk_state: 'joystick',
        battery: { percent: 80, est_runtime_min: 0, charging: false },
        position: {
          x_m: 0, y_m: 0, z_m: 0, heading_deg: 0,
          provider: 'dead_reckoning', quality: 'estimated', accuracy_m: null,
          freshness: 'live', updated_at: '2026-07-20T00:00:00Z',
        },
        speed_mps: 0, speed_ratio: 60, gait: 'flying_trot', obstacle_avoidance: true,
        connectivity: {
          robot_to_edge: 'connected', edge_to_cloud: 'connected', bridge_state: 'connected',
          bridge_latency_ms: null, dds: 'connected', grpc: 'connected',
        },
        maintenance_flagged: false, control_owner: 'operator-dev', active_run: null, nav_goal: null, bridge_boot_id: null, available_motions: [],
        updated_at: '2026-07-20T00:00:00Z',
      },
    ]

    provider.driveRobot('robot-dev-01', 0.2, 0, 0)
    await Promise.resolve()

    const requestInit = postRequestInit()
    const body = JSON.parse((requestInit as RequestInit).body as string)
    // Even a known, correct, non-default gait is not sent: gait selection is the
    // edge's job (it validates against the connected hardware and refuses a
    // mismatch), and a stale browser-side gait would be refused rather than
    // corrected. Changing gait is SET_GAIT's job, not a side effect of driving.
    expect(body.params.gait).toBeUndefined()
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

  // These two used to assert that the browser sends the robot's own gait,
  // guarding a real bug: a hardcoded 'walk' reached wheel robots, which have no
  // walk_velocity_seq, so every wheel drive burst failed silently.
  //
  // DRIVE fixes that bug more robustly by not sending a gait at all. The edge
  // resolves it from the connected hardware, and safety_manager validates rather
  // than substitutes -- so a browser-supplied gait aimed at the wrong type is
  // now REJECTED rather than silently wrong. A browser that cannot name the gait
  // cannot name it incorrectly.
  it.each(['wheel', 'quad'] as const)(
    'omits gait from a drive setpoint for a %s robot, letting the edge resolve it',
    (robotType) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        // A fresh Response per call: a real Response body is single-use, and the
        // provider issues more than one fetch (GET /robots as well as the POST).
        () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      )
      const { provider } = setup(robotType)
      provider.driveRobot('robot-dev-01', 0.5, 0, 0, 60)

      const calls = fetchSpy.mock.calls
      const body = JSON.parse(String(calls[calls.length - 1]?.[1]?.body))
      expect(body.type).toBe('DRIVE')
      expect(body.params.gait).toBeUndefined()
      expect(body.params).toMatchObject({ vx: 0.5, vy: 0, vyaw: 0 })
      fetchSpy.mockRestore()
    },
  )
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

  it.each(['execution_failed', 'timed_out', 'cancelled'])('gives ownership back when TAKE_CONTROL ends %s', async (stage) => {
    const { provider, owner, fetchSpy } = setup()
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', (c) => seen.push(c.current_stage))
    expect(owner()).toBe('operator-dev')
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    send?.('roverhub/site-dev/robot-dev-01/ack', Buffer.from(JSON.stringify({
      command_id: 'c1', robot_id: 'robot-dev-01', type: 'TAKE_CONTROL', label: 'Take Control',
      stages: [], current_stage: stage, initiated_by: 'operator-dev',
    })))
    expect(owner()).toBeNull()
    fetchSpy.mockRestore()
  })

  it('keeps ownership when TAKE_CONTROL completes', async () => {
    const { provider, owner, fetchSpy } = setup()
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', (c) => seen.push(c.current_stage))
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    send?.('roverhub/site-dev/robot-dev-01/ack', Buffer.from(JSON.stringify({
      command_id: 'c1', robot_id: 'robot-dev-01', type: 'TAKE_CONTROL', label: 'Take Control',
      stages: [], current_stage: 'execution_completed', initiated_by: 'operator-dev',
    })))
    expect(owner()).toBe('operator-dev')
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
    // Unknown, NOT 0. A registered-but-silent robot has told us nothing about
    // its battery, and 0 renders as "0%" -- indistinguishable from a genuinely
    // flat one. This is the same mistake audit F1 removed from the bridge and
    // the telemetry schemas; the skeleton kept fabricating it, so a powered-down
    // robot showed a confident 0% instead of "—".
    expect(latest[0].battery.percent).toBeNull()
  })

  it('keeps an unknown battery unknown when telemetry reports null', () => {
    // battery_percent is nullable on the wire (shared 0.0.4): gRPC exposes no
    // battery field, so a bridge without the DDS BMS subscription genuinely does
    // not know. The wire type claimed `number`, so nothing forced a null check.
    const { send, received } = connect()
    send('roverhub/site-dev/robot-a/telemetry', Buffer.from(JSON.stringify({
      ...telemetryFor('robot-a', 'quad', 80), battery_percent: null,
    })))

    const latest = received[received.length - 1]
    expect(latest[0].battery.percent).toBeNull()
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

describe('runs', () => {
  it('lists runs with query params and resolves file and zip URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, next_offset: null }), { status: 200 }))
    const p = new RealDataProvider({ wsUrl: 'ws://x', apiBaseUrl: 'http://api' })
    const page = await p.listRuns({ site_id: 'site-a', limit: 10 })
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/runs?site_id=site-a&limit=10')
    expect(page.sample).toBe(false)
    expect(p.runFileUrl('r1', 'video/run_front.mp4')).toBe('http://api/runs/r1/files/video/run_front.mp4')
    expect(p.runZipUrl('r1')).toBe('http://api/runs/r1/zip')
    fetchMock.mockRestore()
  })
  it('throws when the backend has no runs endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    const p = new RealDataProvider({ wsUrl: 'ws://x', apiBaseUrl: 'http://api' })
    await expect(p.listRuns({})).rejects.toThrow('GET /runs answered 404')
    fetchMock.mockRestore()
  })
})

describe('run records', () => {
  it('PUTs a run and POSTs its events', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const p = new RealDataProvider({ wsUrl: 'ws://x', apiBaseUrl: 'http://api' })
    await p.putRun({ run_id: 'r1', result: 'running' } as never)
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/runs/r1')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT' })
    await p.postRunEvents('r1', [{ run_id: 'r1', seq: 0 } as never])
    expect(fetchMock.mock.calls[1][0]).toBe('http://api/runs/r1/events')
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ events: [{ run_id: 'r1', seq: 0 }] })
    fetchMock.mockResolvedValue(new Response('', { status: 400 }))
    await expect(p.putRun({ run_id: 'r1' } as never)).rejects.toThrow('PUT /runs/r1 answered 400')
    fetchMock.mockRestore()
  })
})


describe('dispose', () => {
  it('ends the broker connection and stops notifying anyone', () => {
    const provider = makeProvider()
    const listener = vi.fn()
    provider.subscribeTelemetry(listener)
    const onMessage = fakeClient.on.mock.calls.find(([event]) => event === 'message')?.[1] as
      (topic: string, payload: Buffer) => void
    expect(onMessage).toBeDefined()

    provider.dispose()

    expect(fakeClient.end).toHaveBeenCalledWith(true)
    // A frame arriving on the old socket after dispose reaches nobody.
    onMessage('roverhub/site-dev/robot-1/state', Buffer.from(JSON.stringify({
      robot_id: 'robot-1', abstract_state: 'STAND', sdk_state: 'balance_stand',
    })))
    expect(listener).not.toHaveBeenCalled()
  })
})

// --- Edge mission runs (schema 0.0.11) --------------------------------------

describe('RealDataProvider run state and run events', () => {
  afterEach(() => vi.restoreAllMocks())

  function connect() {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1] as
      (topic: string, payload: Buffer) => void
    const latest = () => received[received.length - 1].find((r) => r.robot_id === 'robot-dev-01')!
    const state = (extra: Record<string, unknown>) => send('roverhub/site-dev/robot-dev-01/state', Buffer.from(JSON.stringify({
      robot_id: 'robot-dev-01', abstract_state: 'AUTO_MISSION', sdk_state: 'walk', ...extra,
    })))
    return { provider, send, latest, state }
  }

  const stubCommandPost = () => vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(
    new Response(JSON.stringify({ command_id: 'c1', stages: [], current_stage: 'requested' }), { status: 200 })))

  const activeRun = {
    run_id: 'run-1', status: 'running', step_label: 'Walk 1 m', block_id: 'b2',
    started_at: '2026-10-30T00:00:00Z', redo_step_label: null,
  }

  it('test_state_message_sets_active_run_owner_and_boot_id', () => {
    const { latest, state } = connect()
    state({ control_owner: 'mission:run-1', active_run: activeRun, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('mission:run-1')
    expect(latest().active_run).toEqual(activeRun)
    expect(latest().bridge_boot_id).toBe('boot-7')
    // The run ending is a /state with active_run null, which must clear it.
    state({ abstract_state: 'STAND', control_owner: null, active_run: null, bridge_boot_id: 'boot-7' })
    expect(latest().active_run).toBeNull()
    expect(latest().control_owner).toBeNull()
  })

  it('test_state_message_sets_nav_goal_and_clears_it_with_null', () => {
    const { latest, state } = connect()
    state({})
    // A bridge older than 0.0.15 never sends the key: no goal, not a guess.
    expect(latest().nav_goal).toBeNull()
    const goal = {
      goal_id: 'cmd-1', x_m: 1.5, y_m: -2, yaw_rad: null, map_id: 'map-venue',
      state: 'aborted', reason: 'localization_lost', updated_at: '2026-11-10T00:00:00Z',
    }
    state({ nav_goal: goal })
    expect(latest().nav_goal).toEqual(goal)
    // Terminal status stays on the wire until the next goal, so a state that
    // omits the key (an old bridge's heartbeat) does not erase what is known.
    state({ abstract_state: 'STAND' })
    expect(latest().nav_goal).toEqual(goal)
    state({ nav_goal: null })
    expect(latest().nav_goal).toBeNull()
  })

  it('test_state_message_sets_leg_config_and_telemetry_keeps_it', () => {
    const { latest, state } = connect()
    state({})
    // A bridge older than 0.0.12 never says, and that is unknown, not normal.
    expect(latest().leg_config).toBe('unknown')
    state({ leg_config: 'x' })
    expect(latest().leg_config).toBe('x')
    // /state owns it; a later state without the field keeps what is known.
    state({ abstract_state: 'STAND' })
    expect(latest().leg_config).toBe('x')
  })

  it('test_state_without_new_fields_keeps_active_run_null', () => {
    stubCommandPost()
    const { provider, latest, state } = connect()
    state({})
    expect(latest().active_run).toBeNull()
    expect(latest().bridge_boot_id).toBeNull()
    // A 0.0.10 bridge says nothing about the owner, so the optimistic one stays.
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', () => {})
    state({ abstract_state: 'MANUAL' })
    expect(latest().control_owner).toBe('operator-dev')
  })

  /** Sends a terminal-or-not ack for the stubbed command id `c1`. */
  const ackC1 = (send: (topic: string, payload: Buffer) => void, type: string, stage: string) =>
    send('roverhub/site-dev/robot-dev-01/ack', Buffer.from(JSON.stringify({
      command_id: 'c1', robot_id: 'robot-dev-01', type, label: type, stages: [], current_stage: stage,
      initiated_by: 'operator-dev',
    })))

  it('test_wire_owner_overrides_optimistic_owner', async () => {
    stubCommandPost()
    const { provider, latest, state } = connect()
    state({ control_owner: 'operator-dev', active_run: null, bridge_boot_id: 'boot-7' })
    provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release', () => {})
    expect(latest().control_owner).toBeNull()
    // The bridge says a mission holds control: what it says wins.
    state({ control_owner: 'mission:run-1', active_run: activeRun, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('mission:run-1')
  })

  it('test_in_flight_take_control_ignores_null_and_mission_wire_owner', async () => {
    stubCommandPost()
    const { provider, latest, state } = connect()
    state({ control_owner: 'mission:run-1', active_run: activeRun, bridge_boot_id: 'boot-7' })
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', (c) => seen.push(c.current_stage))
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    // The bridge is still standing the robot up: not yet an answer.
    state({ control_owner: 'mission:run-1', active_run: activeRun, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('operator-dev')
    state({ control_owner: null, active_run: { ...activeRun, status: 'paused' }, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('operator-dev')
    // active_run is always the wire's.
    expect(latest().active_run).toMatchObject({ status: 'paused' })
  })

  it('test_in_flight_take_control_ignores_a_nav_wire_owner', async () => {
    // Taking over a walking robot: the bridge cancels the goal, then claims
    // control at the end of the warm-up, so /state keeps naming the goal
    // (nav:<goal_id>) a while. That is "not yet", exactly as mission:<run_id> is.
    stubCommandPost()
    const { provider, latest, state } = connect()
    state({ control_owner: 'nav:g-1', active_run: null, bridge_boot_id: 'boot-7' })
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', (c) => seen.push(c.current_stage))
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    state({ control_owner: 'nav:g-1', active_run: null, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('operator-dev')
    state({ control_owner: null, active_run: null, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('operator-dev')
  })

  it('test_other_operator_wire_owner_overrides_in_flight_take_control', async () => {
    stubCommandPost()
    const { provider, latest, state } = connect()
    state({ control_owner: null, active_run: null, bridge_boot_id: 'boot-7' })
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', (c) => seen.push(c.current_stage))
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    state({ control_owner: 'operator-other', active_run: null, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBe('operator-other')
  })

  it('test_wire_owner_wins_after_take_control_settles', async () => {
    stubCommandPost()
    const { provider, send, latest, state } = connect()
    state({ control_owner: null, active_run: null, bridge_boot_id: 'boot-7' })
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take Control', (c) => seen.push(c.current_stage))
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    ackC1(send, 'TAKE_CONTROL', 'execution_completed')
    expect(latest().control_owner).toBe('operator-dev')
    // Settled: a later null (the deadman's release from another tab, say) is an answer.
    state({ control_owner: null, active_run: null, bridge_boot_id: 'boot-7' })
    expect(latest().control_owner).toBeNull()
  })

  it.each(['execution_failed', 'timed_out', 'cancelled'])('puts the owner back when RELEASE_CONTROL ends %s', async (stage) => {
    stubCommandPost()
    const { provider, send, latest, state } = connect()
    state({ control_owner: 'mission:run-1', active_run: activeRun, bridge_boot_id: 'boot-7' })
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release', (c) => seen.push(c.current_stage))
    expect(latest().control_owner).toBeNull()
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    ackC1(send, 'RELEASE_CONTROL', stage)
    expect(latest().control_owner).toBe('mission:run-1')
  })

  it('keeps the owner cleared when RELEASE_CONTROL completes', async () => {
    stubCommandPost()
    const { provider, send, latest, state } = connect()
    state({ control_owner: 'operator-dev', active_run: null, bridge_boot_id: 'boot-7' })
    const seen: string[] = []
    provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release', (c) => seen.push(c.current_stage))
    await vi.waitFor(() => expect(seen).toEqual(['requested']))
    ackC1(send, 'RELEASE_CONTROL', 'execution_completed')
    expect(latest().control_owner).toBeNull()
  })

  it('test_run_topic_events_reach_subscribers_for_that_robot_only', () => {
    const { provider, send } = connect()
    const forA: unknown[] = []
    const forB: unknown[] = []
    const stopA = provider.subscribeRunEvents('robot-a', (e) => forA.push(e))
    provider.subscribeRunEvents('robot-b', (e) => forB.push(e))
    const event = {
      run_id: 'run-1', seq: 3, at: '2026-10-30T00:00:01Z', kind: 'step_started', waypoint_id: null,
      task_index: null, actor: null, media: null, position: null, detection: null, message: 'Walk 1 m',
      block_id: 'b2', result: null, reason: null, snapshot_id: null,
    }
    send('roverhub/site-dev/robot-a/run', Buffer.from(JSON.stringify(event)))
    expect(forA).toEqual([event])
    expect(forB).toEqual([])
    send('roverhub/site-dev/robot-a/run', Buffer.from('not json'))
    stopA()
    send('roverhub/site-dev/robot-a/run', Buffer.from(JSON.stringify({ ...event, seq: 4 })))
    expect(forA).toHaveLength(1)
  })
})

describe('RealDataProvider starting runs', () => {
  afterEach(() => vi.restoreAllMocks())

  const mission = { mission_id: 'm-1', name: 'Lobby loop', kind: 'program' } as unknown as MissionLibraryEntry
  const steps = [{ kind: 'wait', blockId: 'b1', seconds: 2, label: 'Wait 2 s' }] as Step[]
  const run = { run_id: 'run-1', mission_id: 'm-1', robot_id: 'robot-a', result: 'running' }

  it('test_startRun_posts_body_and_returns_run', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ run, command: { command_id: 'c1' } }), { status: 201 }))
    const out = await makeProvider().startRun('robot-a', { mission, steps, source: 'editor', maxDurationS: 600 })
    expect(out).toEqual({ run })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://localhost:8000/robots/robot-a/runs')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      mission, steps, source: 'editor', started_by: 'operator-dev', max_duration_s: 600,
    })
  })

  it('test_startRun_409_throws_RunStartRefused_with_detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'robot-a is already running a mission' }), { status: 409 }))
    const e = await makeProvider().startRun('robot-a', { mission, steps, source: 'editor' }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(RunStartRefused)
    expect(e).toMatchObject({ message: 'robot-a is already running a mission', status: 409 })
    // 503 is a refusal too; a 500 is not, and stays an ApiError.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'starting runs is not configured' }), { status: 503 }))
    expect(await makeProvider().startRun('robot-a', { mission, steps, source: 'editor' }).catch((x: unknown) => x))
      .toMatchObject({ message: 'starting runs is not configured', status: 503 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }))
    const server = await makeProvider().startRun('robot-a', { mission, steps, source: 'editor' }).catch((x: unknown) => x)
    expect(server).toBeInstanceOf(ApiError)
    expect(server).not.toBeInstanceOf(RunStartRefused)
  })

  it('keeps a 422 an ApiError: it means schema drift, and its detail is not a sentence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      detail: [{ loc: ['body', 'steps', 0, 'kind'], msg: 'Input should be ...', type: 'literal_error' }],
    }), { status: 422 }))
    const e = await makeProvider().startRun('robot-a', { mission, steps, source: 'editor' }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).not.toBeInstanceOf(RunStartRefused)
    expect(e).toMatchObject({ status: 422 })
    // 404 (an unknown task or mission) is a refusal.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'mission not found' }), { status: 404 }))
    expect(await makeProvider().runTaskNow('task-1', steps).catch((x: unknown) => x))
      .toMatchObject({ name: 'RunStartRefused', status: 404, message: 'mission not found' })
  })

  it('test_runTaskNow_posts_steps_and_started_by', async () => {
    const occurrence = { occurrence_id: 'task-1-20261030T000000Z', status: 'running', run_id: 'task-1-20261030T000000Z' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ occurrence, run, command: { command_id: 'c1' } }), { status: 201 }))
    expect(await makeProvider().runTaskNow('task 1', steps)).toEqual({ occurrence, run })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://localhost:8000/tasks/task%201/run-now')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ steps, started_by: 'operator-dev' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'task is paused; only an enabled task can be run' }), { status: 409 }))
    expect(await makeProvider().runTaskNow('task-1', steps).catch((x: unknown) => x))
      .toMatchObject({ name: 'RunStartRefused', message: 'task is paused; only an enabled task can be run', status: 409 })
  })
})

describe('RealDataProvider: a start the edge refuses after the backend accepted it', () => {
  afterEach(() => vi.restoreAllMocks())

  const mission = { mission_id: 'm-1', name: 'Lobby loop', kind: 'program' } as unknown as MissionLibraryEntry
  const steps = [{ kind: 'wait', blockId: 'b1', seconds: 2, label: 'Wait 2 s' }] as Step[]
  const run = { run_id: 'run-1', mission_id: 'm-1', robot_id: 'robot-a', result: 'running' }
  const startCommand = {
    command_id: 'start-1', robot_id: 'robot-a', type: 'START_MISSION', label: 'Start Lobby loop',
    stages: [{ stage: 'requested', at: '2026-10-30T00:00:00Z' }], current_stage: 'requested', initiated_by: 'operator-dev',
    params: { run_id: 'run-1' },
  }
  const refused = {
    ...startCommand, current_stage: 'execution_failed',
    stages: [...startCommand.stages, { stage: 'execution_failed', at: '2026-10-30T00:00:01Z' }],
    failure_reason: 'REJECTED_ROBOT_FALLEN: the robot has fallen',
  }

  function connected() {
    const provider = makeProvider()
    provider.subscribeTelemetry(() => {})
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    const handler = [...fakeClient.on.mock.calls].reverse().find((call) => call[0] === 'message')?.[1] as
      (topic: string, payload: Buffer) => void
    const ack = (command: Record<string, unknown>) => handler('roverhub/site-dev/robot-a/ack', Buffer.from(JSON.stringify(command)))
    return { provider, events, ack }
  }

  const answer = (body: Record<string, unknown>) => vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) =>
    (init as RequestInit | undefined)?.method === 'POST'
      ? new Response(JSON.stringify(body), { status: 201 })
      : new Response(JSON.stringify([]), { status: 200 }))

  it('test_start_mission_failure_after_201_reaches_the_caller_and_the_log', async () => {
    answer({ run, command: startCommand })
    const { provider, events, ack } = connected()
    const seen: string[] = []
    const out = await provider.startRun('robot-a', { mission, steps, source: 'editor' }, (c) => seen.push(c.current_stage))
    expect(out).toEqual({ run })
    ack(refused)
    expect(seen).toEqual(['requested', 'execution_failed'])
    const logged = events.find((e) => e.command_id === 'start-1')
    expect(logged?.severity).toBe('fault')
    expect(logged?.message).toContain('REJECTED_ROBOT_FALLEN')
  })

  it('test_start_mission_failure_that_beats_the_201_is_replayed', async () => {
    const { provider, events, ack } = connected()
    // The edge refuses before the POST's response reaches the browser.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method !== 'POST') return new Response('[]', { status: 200 })
      ack(refused)
      return new Response(JSON.stringify({ run, command: startCommand }), { status: 201 })
    })
    const seen: string[] = []
    await provider.startRun('robot-a', { mission, steps, source: 'editor' }, (c) => seen.push(c.current_stage))
    expect(seen).toEqual(['requested', 'execution_failed'])
    expect(events.some((e) => e.command_id === 'start-1' && e.severity === 'fault')).toBe(true)
  })

  it('test_run_now_registers_its_start_command_too', async () => {
    const occurrence = { occurrence_id: 'run-1', status: 'running', run_id: 'run-1' }
    answer({ occurrence, run, command: startCommand })
    const { provider, events, ack } = connected()
    const seen: string[] = []
    expect(await provider.runTaskNow('task-1', steps, (c) => seen.push(c.current_stage))).toEqual({ occurrence, run })
    ack(refused)
    expect(seen).toEqual(['requested', 'execution_failed'])
    expect(events.some((e) => e.command_id === 'start-1' && e.severity === 'fault')).toBe(true)
  })
})

/** Hardware test 2026-10-30, rover-jetson, one console tab: Run now, then Take
 * control (completed), then -- 60 s idle -- the drive overlay's deadman sent a
 * plain RELEASE_CONTROL, which completed on the bridge and left /state saying
 * control_owner null, active_run paused. The bar showed "paused, nobody has
 * control" for a moment and then went back to "Paused · I have control", with
 * Release & resume, although nobody held control on the robot. The overlay had
 * also sent a DRIVE right after Take control, before the bridge granted it,
 * which the bridge refused REJECTED_NOT_CONTROL_OWNER. */
describe('RealDataProvider control owner around the deadman release', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  const run = {
    run_id: 'run-1', status: 'running', step_label: 'Walk 1 m', block_id: 'b2',
    started_at: '2026-10-30T06:40:00Z', redo_step_label: null,
  }
  const paused = { ...run, status: 'paused' }

  function connect() {
    // Every POST gets its own command_id, as the backend gives it.
    let n = 0
    const posted: { type: string; command_id: string }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse(String(init?.body))
      const command_id = `${body.type}-${++n}`
      posted.push({ type: body.type, command_id })
      return Promise.resolve(new Response(JSON.stringify({
        command_id, robot_id: 'robot-dev-01', type: body.type, label: body.label, params: body.params,
        stages: [{ stage: 'requested', at: '2026-10-30T06:43:40Z' }], current_stage: 'requested',
        initiated_by: 'operator-dev',
      }), { status: 200 }))
    })
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const send = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1] as
      (topic: string, payload: Buffer) => void
    const owner = () => received[received.length - 1].find((r) => r.robot_id === 'robot-dev-01')!.control_owner
    const state = (control_owner: string | null, active_run: unknown) => send('roverhub/site-dev/robot-dev-01/state',
      Buffer.from(JSON.stringify({
        robot_id: 'robot-dev-01', abstract_state: 'AUTO_MISSION', sdk_state: 'walk',
        control_owner, active_run, bridge_boot_id: 'boot-7',
      })))
    const ack = (type: string, stage: string, failure_reason?: string) => {
      const id = [...posted].reverse().find((p) => p.type === type)!.command_id
      send('roverhub/site-dev/robot-dev-01/ack', Buffer.from(JSON.stringify({
        command_id: id, robot_id: 'robot-dev-01', type, label: type, stages: [], current_stage: stage,
        failure_reason, initiated_by: 'operator-dev',
      })))
    }
    return { provider, owner, state, ack, posted }
  }

  /** Run now, then Take control, granted. */
  async function takenDuringRun(c: ReturnType<typeof connect>) {
    c.state('mission:run-1', run)
    c.provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take control', () => {})
    await vi.advanceTimersByTimeAsync(0)
    // Warm-up: the run pauses before the bridge claims control.
    c.state(null, paused)
    expect(c.owner()).toBe('operator-dev')
    c.state('operator-dev', paused)
    c.ack('TAKE_CONTROL', 'execution_completed')
    expect(c.owner()).toBe('operator-dev')
  }

  it('stays released when the release lands after the console stopped waiting for it', async () => {
    vi.useFakeTimers()
    const c = connect()
    await takenDuringRun(c)
    c.provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release control (auto timeout)', () => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(c.owner()).toBeNull()
    // The bridge lowers the robot to balance_stand, clears the owner and says so...
    c.state(null, paused)
    // ...and the console's deadline passes before the completed ack. (It was
    // 5 s then; it now covers the release path, but a late ack can still lose.)
    await vi.advanceTimersByTimeAsync(ackDeadlineMs('RELEASE_CONTROL'))
    expect(c.owner()).toBeNull()
    c.ack('RELEASE_CONTROL', 'execution_completed')
    expect(c.owner()).toBeNull()
    // Heartbeat republishes change nothing.
    c.state(null, paused)
    expect(c.owner()).toBeNull()
  })

  it('stays released when a /state from before the release arrives after it', async () => {
    vi.useFakeTimers()
    const c = connect()
    await takenDuringRun(c)
    c.provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release control (auto timeout)', () => {})
    await vi.advanceTimersByTimeAsync(0)
    // A /state built before the bridge handled the release.
    c.state('operator-dev', paused)
    expect(c.owner()).toBeNull()
    c.state(null, paused)
    c.ack('RELEASE_CONTROL', 'execution_completed')
    expect(c.owner()).toBeNull()
  })

  it('puts back what the bridge last said, not what the console assumed, when a release fails', async () => {
    vi.useFakeTimers()
    const c = connect()
    await takenDuringRun(c)
    c.provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release control', () => {})
    await vi.advanceTimersByTimeAsync(0)
    // Refused: the bridge still has this operator in control.
    c.state('operator-dev', paused)
    c.ack('RELEASE_CONTROL', 'execution_failed', 'REJECTED_SOMETHING')
    expect(c.owner()).toBe('operator-dev')
  })

  it('sends no DRIVE until the bridge has granted control', async () => {
    vi.useFakeTimers()
    const c = connect()
    c.state('mission:run-1', run)
    c.provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take control', () => {})
    await vi.advanceTimersByTimeAsync(0)
    // The overlay mounts on the optimistic owner and sends its stop at once.
    expect(c.owner()).toBe('operator-dev')
    c.provider.driveRobot('robot-dev-01', 0, 0, 0)
    c.state(null, paused)
    c.provider.driveRobot('robot-dev-01', 0.2, 0, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(c.posted.filter((p) => p.type === 'DRIVE')).toEqual([])
    // Granted on the wire: driving goes out.
    c.state('operator-dev', paused)
    c.provider.driveRobot('robot-dev-01', 0.2, 0, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(c.posted.filter((p) => p.type === 'DRIVE')).toHaveLength(1)
  })

  it('sends no DRIVE while this tab is releasing, on the strength of a pre-release /state', async () => {
    vi.useFakeTimers()
    const c = connect()
    await takenDuringRun(c)
    c.provider.dispatchCommand('robot-dev-01', 'RELEASE_CONTROL', 'Release control', () => {})
    await vi.advanceTimersByTimeAsync(0)
    // The wire still names this operator: the bridge has not handled the release yet.
    c.provider.driveRobot('robot-dev-01', 0.2, 0, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(c.posted.filter((p) => p.type === 'DRIVE')).toEqual([])
  })

  it('sends DRIVE once TAKE_CONTROL completes, for a bridge that does not report the owner', async () => {
    vi.useFakeTimers()
    const c = connect()
    c.provider.dispatchCommand('robot-dev-01', 'TAKE_CONTROL', 'Take control', () => {})
    await vi.advanceTimersByTimeAsync(0)
    c.provider.driveRobot('robot-dev-01', 0, 0, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(c.posted.filter((p) => p.type === 'DRIVE')).toEqual([])
    c.ack('TAKE_CONTROL', 'execution_completed')
    c.provider.driveRobot('robot-dev-01', 0, 0, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(c.posted.filter((p) => p.type === 'DRIVE')).toHaveLength(1)
  })
})

describe('RealDataProvider broker session', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) })
  afterEach(() => { global.fetch = originalFetch })

  const ana = { ...DEV_USER, user_id: 'u-ana', username: 'ana' }

  it('connects with no login when sign-in is off, exactly as before', () => {
    const provider = new RealDataProvider({ wsUrl: 'ws://b', apiBaseUrl: 'http://a', brokerSession: brokerSessionFor({ status: 'off', user: DEV_USER, token: null }) })
    provider.subscribeTelemetry(() => {})
    expect(vi.mocked(connectBroker).mock.calls[0][0]).not.toHaveProperty('credentials')
  })

  it('passes the signed-in user id and token to the broker', () => {
    const provider = new RealDataProvider({ wsUrl: 'ws://b', apiBaseUrl: 'http://a', brokerSession: brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok' }) })
    provider.subscribeTelemetry(() => {})
    expect(vi.mocked(connectBroker).mock.calls[0][0].credentials).toEqual({ username: 'u-ana', password: 'tok' })
  })

  it('does not connect while signed out, and connects on sign-in', () => {
    const provider = new RealDataProvider({ wsUrl: 'ws://b', apiBaseUrl: 'http://a', brokerSession: brokerSessionFor({ status: 'signedOut', user: null, token: null }) })
    provider.subscribeTelemetry(() => {})
    expect(connectBroker).not.toHaveBeenCalled()
    provider.setBrokerSession(brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok' }))
    expect(vi.mocked(connectBroker).mock.calls[0][0].credentials).toEqual({ username: 'u-ana', password: 'tok' })
  })

  it('drops the connection on sign-out and reconnects as the next user', () => {
    const provider = new RealDataProvider({ wsUrl: 'ws://b', apiBaseUrl: 'http://a', brokerSession: brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok' }) })
    provider.subscribeTelemetry(() => {})
    provider.setBrokerSession(brokerSessionFor({ status: 'signedOut', user: null, token: null }))
    expect(fakeClient.end).toHaveBeenCalledWith(true)
    expect(connectBroker).toHaveBeenCalledTimes(1)
    const bo = { ...ana, user_id: 'u-bo' }
    provider.setBrokerSession(brokerSessionFor({ status: 'signedIn', user: bo, token: 'tok2' }))
    expect(connectBroker).toHaveBeenCalledTimes(2)
    expect(vi.mocked(connectBroker).mock.calls[1][0].credentials).toEqual({ username: 'u-bo', password: 'tok2' })
  })

  it('keeps the connection when the same user gets a renewed token, and reconnects with the new one', () => {
    const provider = new RealDataProvider({ wsUrl: 'ws://b', apiBaseUrl: 'http://a', brokerSession: brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok' }) })
    provider.subscribeTelemetry(() => {})
    provider.setBrokerSession(brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok-renewed' }))
    expect(connectBroker).toHaveBeenCalledTimes(1)
    expect(fakeClient.end).not.toHaveBeenCalled()
    expect(fakeClient.options.password).toBe('tok-renewed')
  })

  it('ignores an unchanged session, so store updates do not reconnect', () => {
    const provider = new RealDataProvider({ wsUrl: 'ws://b', apiBaseUrl: 'http://a', brokerSession: brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok' }) })
    provider.subscribeTelemetry(() => {})
    provider.setBrokerSession(brokerSessionFor({ status: 'signedIn', user: ana, token: 'tok' }))
    expect(connectBroker).toHaveBeenCalledTimes(1)
    expect(fakeClient.end).not.toHaveBeenCalled()
  })
})

describe('RealDataProvider perception', () => {
  const incident = (over: Record<string, unknown> = {}) => ({
    incident_id: 'rover-a-0123456789ab', robot_id: 'rover-a', site_id: 'site-dev',
    rule_id: 'builtin.fall_alert', label: 'fallen_person', severity: 'critical',
    opened_at: '2026-11-09T10:00:00+00:00', camera: 'front', detections: [],
    evidence_snapshot_ids: ['snap-1'], evidence_pending: false, state: 'open',
    message: 'Fallen person detected — front camera (87%)', ...over,
  })
  const deliver = (topic: string, payload: unknown) => {
    const handler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    handler?.(topic, Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
  }

  it('incident message emits a critical timeline event', () => {
    const provider = makeProvider()
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    deliver('roverhub/site-dev/rover-a/incidents', incident())
    expect(events).toEqual([{
      event_id: 'rover-a-0123456789ab', source: 'edge', severity: 'critical',
      message: 'Fallen person detected — front camera (87%)', ts: '2026-11-09T10:00:00+00:00', acknowledged: false,
    }])
  })

  it('lying incident is a warning', () => {
    const provider = makeProvider()
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    deliver('roverhub/site-dev/rover-a/incidents', incident({ label: 'person_lying', severity: 'warning', message: 'Person lying down — front camera (70%)' }))
    expect(events[0]).toMatchObject({ severity: 'warning', message: 'Person lying down — front camera (70%)' })
  })

  it('evidence_pending is mentioned', () => {
    const provider = makeProvider()
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    deliver('roverhub/site-dev/rover-a/incidents', incident({ evidence_pending: true, evidence_snapshot_ids: [] }))
    expect(events[0].message).toBe('Fallen person detected — front camera (87%) (evidence not uploaded)')
  })

  it('perception status is stored and does not reach state handling', () => {
    const provider = makeProvider()
    const robots: RobotState[][] = []
    provider.subscribeTelemetry((r) => robots.push(r))
    const status = {
      robot_id: 'rover-a', site_id: 'site-dev', at: '2026-11-09T10:00:00+00:00', camera: 'front',
      source_state: 'live', fps: 9.8,
      detectors: [{ detector_id: 'base.person', kind: 'model', version: 'dfine_s.onnx', labels: ['person'], status: 'running', fps: 9.8, reason: null }],
    }
    deliver('roverhub/site-dev/rover-a/perception/status', status)
    expect(provider.getPerceptionStatus('rover-a')).toEqual(status)
    expect(provider.getPerceptionStatus('rover-b')).toBeUndefined()
    expect(robots).toEqual([])
  })

  it('an info incident stays info', () => {
    const provider = makeProvider()
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    deliver('roverhub/site-dev/rover-a/incidents', incident({ severity: 'info', message: 'Person seen' }))
    expect(events[0].severity).toBe('info')
  })

  it('a redelivered incident is shown once', () => {
    // QoS 1 is at-least-once: the broker may deliver the same incident twice.
    const provider = makeProvider()
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    deliver('roverhub/site-dev/rover-a/incidents', incident())
    deliver('roverhub/site-dev/rover-a/incidents', incident())
    deliver('roverhub/site-dev/rover-a/incidents', incident({ incident_id: 'rover-a-other' }))
    expect(events.map((e) => e.event_id)).toEqual(['rover-a-0123456789ab', 'rover-a-other'])
  })

  it('malformed incident is ignored without throwing', () => {
    const provider = makeProvider()
    const events: TimelineEvent[] = []
    provider.subscribeEvents((e) => events.push(e))
    expect(() => deliver('roverhub/site-dev/rover-a/incidents', '{not json')).not.toThrow()
    expect(() => deliver('roverhub/site-dev/rover-a/incidents', { incident_id: 'x' })).not.toThrow()
    expect(() => deliver('roverhub/site-dev/rover-a/perception/status', '{nope')).not.toThrow()
    expect(events).toEqual([])
  })
})

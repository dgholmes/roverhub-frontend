import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn() }

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => fakeClient),
}))

import { RealDataProvider } from './realDataProvider'
import type { RobotState } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeProvider() {
  return new RealDataProvider({
    wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000',
    siteId: 'site-dev', robotId: 'robot-dev-01', robotName: 'Dev Robot',
  })
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
  })

  it('ignores unparseable payloads', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from('not json'))
    expect(received).toHaveLength(0)
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
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const updates: unknown[] = []
    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (command) => updates.push(command))

    await Promise.resolve()
    await Promise.resolve()

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
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const updates: unknown[] = []
    provider.dispatchCommand('robot-dev-01', 'ESTOP', 'E-Stop', (command) => updates.push(command))
    await Promise.resolve()
    await Promise.resolve()

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.(
      'roverhub/site-dev/robot-dev-01/ack',
      Buffer.from(JSON.stringify({ ...requestedCommand, current_stage: 'execution_completed' })),
    )

    expect(updates).toHaveLength(2)
    expect((updates[1] as { current_stage: string }).current_stage).toBe('execution_completed')
  })
})

describe('RealDataProvider expanded command coverage', () => {
  it('routes all newly-wired command types through the real POST path', async () => {
    const requestedCommand = {
      command_id: 'cmd-1', robot_id: 'robot-dev-01', type: 'LINE_WALK', label: 'Walk forward',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(requestedCommand) })

    const provider = makeProvider()
    const updates: unknown[] = []
    provider.dispatchCommand('robot-dev-01', 'LINE_WALK', 'Walk forward', (command) => updates.push(command), { direction: 'forward', distance: 1.0 })

    await Promise.resolve()
    await Promise.resolve()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/commands'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(updates).toHaveLength(1)
  })

  it('still delegates a genuinely unwired type (PAUSE) to mockDataProvider', () => {
    const provider = makeProvider()
    const spy = vi.spyOn(mockDataProvider, 'dispatchCommand')

    provider.dispatchCommand('robot-dev-01', 'PAUSE', 'Pause', () => {})

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
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

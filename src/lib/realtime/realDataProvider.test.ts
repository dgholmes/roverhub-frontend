import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn() }

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => fakeClient),
}))

import { RealDataProvider } from './realDataProvider'
import type { RobotState } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { DRIVE_SPEED_RATIO, DRIVE_TICK_SECONDS } from '@/lib/teleop'

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

  it('routes SET_GAIT through the real POST path instead of falling back to mockDataProvider', async () => {
    const requestedCommand = {
      command_id: 'cmd-gait-1', robot_id: 'robot-dev-01', type: 'SET_GAIT', label: 'Set Gait',
      stages: [], current_stage: 'requested', initiated_by: 'operator-dev',
    }
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(requestedCommand) })
    const spy = vi.spyOn(mockDataProvider, 'dispatchCommand')

    const provider = makeProvider()
    provider.dispatchCommand('robot-dev-01', 'SET_GAIT', 'Set Gait', () => {}, { gait: 'flying_trot' })

    await Promise.resolve()
    await Promise.resolve()

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
  })

  it('POSTs the file as multipart/form-data to the audio-clips endpoint and returns the real file_path', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file_path: '/srv/clips/robot-dev-01-abc123.wav' }),
    })

    const provider = makeProvider()
    const file = new File(['fake-audio-bytes'], 'clip.wav', { type: 'audio/wav' })
    const result = await provider.uploadAudioClip('robot-dev-01', file)

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/robots/robot-dev-01/audio-clips'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
    expect(result).toEqual({ file_path: '/srv/clips/robot-dev-01-abc123.wav' })
  })

  it('throws when the upload endpoint responds with a non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 413 })

    const provider = makeProvider()
    const file = new File(['x'], 'clip.wav', { type: 'audio/wav' })

    await expect(provider.uploadAudioClip('robot-dev-01', file)).rejects.toThrow('413')
  })
})

describe('RealDataProvider driveRobot', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFetchResolving(command: Record<string, unknown>) {
    return vi.fn().mockResolvedValue({ json: () => Promise.resolve(command) })
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
    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
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

    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
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

    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
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

    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
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

    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
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

import type { MqttClient } from 'mqtt'
import type { Command, CommandType, RobotState, TimelineEvent } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { connectBroker } from './mqttClient'

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void

interface RealDataProviderConfig {
  wsUrl: string
  apiBaseUrl: string
  siteId: string
  robotId: string
  robotName: string
}

const WIRED_COMMAND_TYPES = new Set<CommandType>([
  'ESTOP', 'RESET_ESTOP', 'TAKE_CONTROL', 'RELEASE_CONTROL', 'SET_OBSTACLE_AVOIDANCE',
])

interface TelemetryFrameWire {
  robot_id: string
  site_id: string
  robot_type: 'quad' | 'wheel'
  pos_body: [number, number, number]
  vel_body: [number, number, number]
  speed_ratio: number
  battery_percent: number
  obstacle_avoidance_enabled: boolean
  grpc_freshness: 'live' | 'stale' | 'missing'
  captured_at: string
}

/** Real MQTT-backed data provider -- same shape as mockDataProvider so
 * useLiveOpsStore doesn't change. Telemetry, state, and heartbeat topics are
 * wired for real (Slices 1-2). Of the command types, the five wired in
 * Slice 3 (ESTOP, RESET_ESTOP, TAKE_CONTROL, RELEASE_CONTROL,
 * SET_OBSTACLE_AVOIDANCE -- see WIRED_COMMAND_TYPES) POST to the backend and
 * resolve their ACK progression from the `ack` topic; every other command
 * type, `driveRobot`, and `subscribeEvents` still delegate to
 * mockDataProvider until their own slice wires them for real (see
 * docs/superpowers/specs/2026-07-20-robot-bridge-design.md SS7). */
export class RealDataProvider {
  private config: RealDataProviderConfig
  private client: MqttClient | null = null
  private robots: RobotState[] = []
  private telemetryListeners = new Set<TelemetryListener>()
  private pendingCommandCallbacks = new Map<string, (command: Command) => void>()

  constructor(config: RealDataProviderConfig) {
    this.config = config
  }

  getRobots(): RobotState[] {
    return this.robots
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener)
    this.ensureConnected()
    return () => {
      this.telemetryListeners.delete(listener)
    }
  }

  subscribeEvents(listener: EventListener): () => void {
    return mockDataProvider.subscribeEvents(listener)
  }

  dispatchCommand(
    robotId: string,
    type: CommandType,
    label: string,
    onUpdate: (command: Command) => void,
    params?: Record<string, unknown>,
  ): void {
    if (!WIRED_COMMAND_TYPES.has(type)) {
      mockDataProvider.dispatchCommand(robotId, type, label, onUpdate, params)
      return
    }
    this.ensureConnected()
    void this.postCommand(robotId, type, label, onUpdate, params)
  }

  private async postCommand(
    robotId: string,
    type: CommandType,
    label: string,
    onUpdate: (command: Command) => void,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const response = await fetch(`${this.config.apiBaseUrl}/robots/${robotId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, label, params, initiated_by: 'operator-dev' }),
    })
    const command: Command = await response.json()
    this.pendingCommandCallbacks.set(command.command_id, onUpdate)
    onUpdate(command)
  }

  private ensureConnected(): void {
    if (this.client) return
    this.client = connectBroker(this.config)
    this.client.on('message', (topic: string, payload: Buffer) => this.handleMessage(topic, payload))
  }

  driveRobot(robotId: string, vx: number, vy: number, vyaw: number): void {
    mockDataProvider.driveRobot(robotId, vx, vy, vyaw)
  }

  /** Maps a raw telemetry MQTT payload into a RobotState, merging onto
   * whatever this robot's existing state already has. Telemetry is the
   * highest-frequency topic (~1 Hz), so it must NOT clobber fields that
   * only `/state` and `/heartbeat` messages own (abstract_state, sdk_state,
   * most of connectivity, control_owner, maintenance_flagged) -- those are
   * preserved from the existing robot, if any, and only default to interim
   * placeholders the first time a given robot_id is ever seen. `connectivity.grpc`
   * is the one connectivity field telemetry itself sources (via grpc_freshness),
   * so it's refreshed from the current frame every time regardless. */
  private handleTelemetryMessage(payload: Buffer): void {
    let frame: TelemetryFrameWire
    try {
      frame = JSON.parse(payload.toString())
    } catch {
      return
    }

    const existing = this.robots.find((r) => r.robot_id === frame.robot_id)
    const [x, y] = frame.pos_body
    const nextState: RobotState = {
      robot_id: frame.robot_id,
      name: this.config.robotName,
      site_id: frame.site_id,
      robot_type: frame.robot_type,
      abstract_state: existing?.abstract_state ?? 'STAND',
      sdk_state: existing?.sdk_state ?? 'unknown',
      battery: { percent: frame.battery_percent, est_runtime_min: 0, charging: false },
      position: {
        x_m: x,
        y_m: y,
        heading_deg: existing?.position.heading_deg ?? 0,
        provider: 'dead_reckoning',
        freshness: frame.grpc_freshness,
        updated_at: frame.captured_at,
      },
      speed_mps: Math.hypot(frame.vel_body[0], frame.vel_body[1]),
      gait: existing?.gait ?? 'walk',
      obstacle_avoidance: frame.obstacle_avoidance_enabled,
      connectivity: existing?.connectivity
        ? {
            ...existing.connectivity,
            grpc: frame.grpc_freshness === 'missing' ? 'unavailable' : 'connected',
          }
        : {
            robot_to_edge: 'unavailable',
            edge_to_cloud: 'connected',
            bridge_state: 'connected',
            bridge_latency_ms: null,
            dds: 'unavailable',
            grpc: frame.grpc_freshness === 'missing' ? 'unavailable' : 'connected',
          },
      maintenance_flagged: existing?.maintenance_flagged ?? false,
      control_owner: existing?.control_owner ?? null,
      updated_at: frame.captured_at,
    }

    this.robots = [nextState, ...this.robots.filter((r) => r.robot_id !== frame.robot_id)]
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }

  private handleMessage(topic: string, payload: Buffer): void {
    if (topic.endsWith('/telemetry')) this.handleTelemetryMessage(payload)
    else if (topic.endsWith('/state')) this.handleStateMessage(payload)
    else if (topic.endsWith('/heartbeat')) this.handleHeartbeatMessage(payload)
    else if (topic.endsWith('/ack')) this.handleAckMessage(payload)
  }

  private handleAckMessage(payload: Buffer): void {
    let command: Command
    try {
      command = JSON.parse(payload.toString())
    } catch {
      return
    }
    const callback = this.pendingCommandCallbacks.get(command.command_id)
    callback?.(command)
    if (command.current_stage === 'execution_completed' || command.current_stage === 'execution_failed') {
      this.pendingCommandCallbacks.delete(command.command_id)
    }
  }

  private handleStateMessage(payload: Buffer): void {
    let update: { robot_id: string; abstract_state: RobotState['abstract_state']; sdk_state: string }
    try {
      update = JSON.parse(payload.toString())
    } catch {
      return
    }
    this.robots = this.robots.map((r) =>
      r.robot_id === update.robot_id
        ? { ...r, abstract_state: update.abstract_state, sdk_state: update.sdk_state }
        : r,
    )
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }

  private handleHeartbeatMessage(payload: Buffer): void {
    let hb: { robot_id: string; sdk_connected: boolean; dds_connected: boolean; cloud_connected: boolean }
    try {
      hb = JSON.parse(payload.toString())
    } catch {
      return
    }
    this.robots = this.robots.map((r) =>
      r.robot_id === hb.robot_id
        ? {
            ...r,
            connectivity: {
              ...r.connectivity,
              grpc: hb.sdk_connected ? 'connected' : 'unavailable',
              dds: hb.dds_connected ? 'connected' : 'unavailable',
              edge_to_cloud: hb.cloud_connected ? 'connected' : 'offline',
            },
          }
        : r,
    )
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }
}

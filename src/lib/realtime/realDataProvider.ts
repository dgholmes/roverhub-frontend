import type { MqttClient } from 'mqtt'
import type { Command, CommandType, RobotState, TimelineEvent } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { connectBroker } from './mqttClient'

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void

interface RealDataProviderConfig {
  wsUrl: string
  siteId: string
  robotId: string
  robotName: string
}

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
 * useLiveOpsStore doesn't change. Slice 1 wires telemetry only; events and
 * every command type delegate to mockDataProvider until their own slice
 * wires them for real (see docs/superpowers/specs/2026-07-20-robot-bridge-design.md SS7). */
export class RealDataProvider {
  private config: RealDataProviderConfig
  private client: MqttClient | null = null
  private robots: RobotState[] = []
  private telemetryListeners = new Set<TelemetryListener>()

  constructor(config: RealDataProviderConfig) {
    this.config = config
  }

  getRobots(): RobotState[] {
    return this.robots
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener)
    if (!this.client) {
      this.client = connectBroker(this.config)
      this.client.on('message', (_topic: string, payload: Buffer) =>
        this.handleTelemetryMessage(payload),
      )
    }
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
    mockDataProvider.dispatchCommand(robotId, type, label, onUpdate, params)
  }

  driveRobot(robotId: string, vx: number, vy: number, vyaw: number): void {
    mockDataProvider.driveRobot(robotId, vx, vy, vyaw)
  }

  /** Maps a raw telemetry MQTT payload into a RobotState. Fields not yet
   * sourced this slice (abstract_state, connectivity detail, gait,
   * control_owner) use interim defaults, overwritten once state/heartbeat
   * wiring (Slice 2) and command wiring (Slice 3) land. */
  private handleTelemetryMessage(payload: Buffer): void {
    let frame: TelemetryFrameWire
    try {
      frame = JSON.parse(payload.toString())
    } catch {
      return
    }

    const [x, y] = frame.pos_body
    const nextState: RobotState = {
      robot_id: frame.robot_id,
      name: this.config.robotName,
      site_id: frame.site_id,
      robot_type: frame.robot_type,
      abstract_state: 'STAND',
      sdk_state: 'unknown',
      battery: { percent: frame.battery_percent, est_runtime_min: 0, charging: false },
      position: {
        x_m: x,
        y_m: y,
        heading_deg: 0,
        provider: 'dead_reckoning',
        freshness: frame.grpc_freshness,
        updated_at: frame.captured_at,
      },
      speed_mps: Math.hypot(frame.vel_body[0], frame.vel_body[1]),
      gait: 'walk',
      obstacle_avoidance: frame.obstacle_avoidance_enabled,
      connectivity: {
        robot_to_edge: 'unavailable',
        edge_to_cloud: 'connected',
        bridge_state: 'connected',
        bridge_latency_ms: null,
        dds: 'unavailable',
        grpc: frame.grpc_freshness === 'missing' ? 'unavailable' : 'connected',
      },
      maintenance_flagged: false,
      control_owner: null,
      updated_at: frame.captured_at,
    }

    this.robots = [nextState, ...this.robots.filter((r) => r.robot_id !== frame.robot_id)]
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }
}

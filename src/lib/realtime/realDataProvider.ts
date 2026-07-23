import type { MqttClient } from 'mqtt'
import type { Command, CommandType, RobotState, TimelineEvent } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { DRIVE_SPEED_RATIO, DRIVE_TICK_SECONDS } from '@/lib/teleop'
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
  'SET_STATE', 'SET_GAIT', 'CHANGE_MODE', 'SET_SPEED_RATIO', 'VELOCITY_SEQUENCE',
  'LINE_WALK', 'ROTATE', 'CIRCLE',
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
  'LED_SIGNAL', 'SPEAK',
])

interface TelemetryFrameWire {
  robot_id: string
  site_id: string
  robot_type: 'quad' | 'wheel'
  pos_body: [number, number, number]
  vel_body: [number, number, number]
  acc_body: [number, number, number]
  omega_body: [number, number, number]
  ori_body: [number, number, number]
  jpos_leg: number[]
  jvel_leg: number[]
  jtau_leg: number[]
  grf_left: [number, number, number]
  grf_right: [number, number, number]
  speed_ratio: number
  battery_percent: number
  obstacle_avoidance_enabled: boolean
  grpc_freshness: 'live' | 'stale' | 'missing'
  captured_at: string
}

/** Real MQTT-backed data provider -- same shape as mockDataProvider so
 * useLiveOpsStore doesn't change. Telemetry, state, and heartbeat topics are
 * wired for real (Slices 1-2). Of the command types, the 19 wired via the
 * Full High-Level SDK Command Expansion plan (see WIRED_COMMAND_TYPES) POST
 * to the backend and resolve their ACK progression from the `ack` topic;
 * every other command type and `subscribeEvents` still delegate to
 * mockDataProvider until their own slice wires them for real (see
 * docs/superpowers/specs/2026-07-20-robot-bridge-design.md SS7). `driveRobot`
 * is wired for real too -- unlike mockDataProvider's driveRobot (a synthetic,
 * dead-reckoned position nudge with no ack), the real edge bridge has no
 * continuous-velocity concept at all, so each drive tick is sent as one real
 * `VELOCITY_SEQUENCE` command through the same POST path as any other wired
 * command; see the `driveRobot` method doc below. */
export class RealDataProvider {
  private config: RealDataProviderConfig
  private client: MqttClient | null = null
  private robots: RobotState[] = []
  private telemetryListeners = new Set<TelemetryListener>()
  private eventListeners = new Set<EventListener>()
  private pendingCommandCallbacks = new Map<string, (command: Command) => void>()
  /** command_ids from driveRobot's own bursts -- these still go through
   * postCommand/handleAckMessage like any other wired command (so the drive
   * loop gets real acks), but must never surface as a log/alert entry: at
   * one burst per DRIVE_TICK_MS while a key is held, logging every
   * completion would flood the Logs panel uselessly. */
  private silentCommandIds = new Set<string>()

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

  /** Real command-outcome log, derived from actual ack terminal stages
   * (execution_completed/execution_failed) instead of delegating to
   * mockDataProvider's fabricated events -- the Logs panel was previously
   * showing synthetic activity even in real mode, with zero connection to
   * what the edge bridge/robot actually did. */
  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  private emitEvent(evt: TimelineEvent) {
    this.eventListeners.forEach((l) => l(evt))
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
    logWorthy = true,
  ): Promise<void> {
    const response = await fetch(`${this.config.apiBaseUrl}/robots/${robotId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, label, params, initiated_by: 'operator-dev' }),
    })
    const command: Command = await response.json()
    this.pendingCommandCallbacks.set(command.command_id, onUpdate)
    if (!logWorthy) this.silentCommandIds.add(command.command_id)
    onUpdate(command)
  }

  /** Uploads a real audio file to `backend/control/media.py`'s
   * `POST /robots/{robot_id}/audio-clips` multipart endpoint, which saves it
   * to a shared filesystem location the edge bridge can read and returns the
   * real on-disk path. That `file_path` is what a subsequent `SPEAK` command
   * must carry in `params.file_path` -- `dobot_adapter.py::speak` reads the
   * file straight off disk, so a label/clip-name string is not usable here. */
  async uploadAudioClip(robotId: string, file: File): Promise<{ file_path: string }> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${this.config.apiBaseUrl}/robots/${robotId}/audio-clips`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Audio clip upload failed (${response.status})`)
    }
    return response.json()
  }

  private ensureConnected(): void {
    if (this.client) return
    this.client = connectBroker(this.config)
    this.client.on('message', (topic: string, payload: Buffer) => this.handleMessage(topic, payload))
  }

  /** Teleoperation velocity burst. The real edge bridge has no continuous-
   * velocity / streaming setpoint at all -- the only real movement primitive
   * is `VELOCITY_SEQUENCE`, a bounded, timed burst (`dobot_adapter.py::
   * send_velocity_sequence`). So instead of mockDataProvider's synthetic
   * position dead-reckoning, each call here fires one real `VELOCITY_SEQUENCE`
   * command whose single step's duration is `DRIVE_TICK_SECONDS` -- the same
   * cadence `ManualControlOverlay` re-issues driveRobot at (see
   * `@/lib/teleop`), so consecutive bursts neither leave a gap nor overlap.
   * `gait` is read from this robot's last-known state (defaulting to 'walk'
   * for a robot this provider hasn't seen telemetry for yet); `speedRatio`
   * is the operator's current speed-cap tier from ManualControlOverlay's
   * SPEED_OPTIONS (falling back to DRIVE_SPEED_RATIO if omitted, e.g. the
   * explicit zero-velocity stop calls) -- previously this was always the
   * fixed DRIVE_SPEED_RATIO constant regardless of the UI's speed-cap
   * picker, so the picker had no effect on the real robot's SDK-side speed
   * at all. Fires via the same postCommand path dispatchCommand uses for
   * every other wired command type, with a no-op update callback -- driving
   * has no Command/ack UI of its own (matching mockDataProvider.driveRobot's
   * "no Command object, no ack toast" design). */
  driveRobot(robotId: string, vx: number, vy: number, vyaw: number, speedRatio?: number): void {
    this.ensureConnected()
    const gait = this.robots.find((r) => r.robot_id === robotId)?.gait ?? 'walk'
    void this.postCommand(robotId, 'VELOCITY_SEQUENCE', 'Manual Drive', () => {}, {
      steps: [[vx, vy, vyaw, DRIVE_TICK_SECONDS]],
      gait,
      speed_ratio: speedRatio ?? DRIVE_SPEED_RATIO,
    }, false)
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
      speed_ratio: frame.speed_ratio,
      gait: existing?.gait ?? 'walk',
      obstacle_avoidance: frame.obstacle_avoidance_enabled,
      physics: {
        acc_body: frame.acc_body,
        omega_body: frame.omega_body,
        ori_body: frame.ori_body,
        jpos_leg: frame.jpos_leg,
        jvel_leg: frame.jvel_leg,
        jtau_leg: frame.jtau_leg,
        grf_left: frame.grf_left,
        grf_right: frame.grf_right,
      },
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
      available_motions: existing?.available_motions ?? [],
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
      const wasSilent = this.silentCommandIds.delete(command.command_id)
      if (!wasSilent) this.emitEvent(this.eventForCommand(command))
    }
  }

  private eventForCommand(command: Command): TimelineEvent {
    const failed = command.current_stage === 'execution_failed'
    const lastStageAt = command.stages[command.stages.length - 1]?.at ?? new Date().toISOString()
    return {
      event_id: `${command.command_id}-${command.current_stage}`,
      source: 'edge',
      severity: failed ? 'fault' : 'info',
      message: failed
        ? `${command.label} failed${command.failure_reason ? `: ${command.failure_reason}` : ''}`
        : `${command.label} completed`,
      ts: lastStageAt,
      command_id: command.command_id,
      acknowledged: false,
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
    let hb: {
      robot_id: string
      sdk_connected: boolean
      dds_connected: boolean
      cloud_connected: boolean
      available_motions?: string[]
    }
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
            available_motions: hb.available_motions ?? r.available_motions ?? [],
          }
        : r,
    )
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }
}

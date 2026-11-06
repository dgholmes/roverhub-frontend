/**
 * PROVISIONAL — shared/schemas/robot_state.py is currently empty (0 bytes).
 * These types are the frontend's best-effort mirror of the eventual Pydantic
 * contract, derived from docs/01-prd.md, docs/05-ui-ux.md, and the Dobot SDK
 * robot_client.py state/field names. Once robot_state.py is authored, reconcile
 * field names here against it — this file is not the source of truth long-term.
 */

/** Abstract robot states surfaced to the frontend. The edge bridge maps raw SDK
 * FSM states onto these — the frontend must never receive or render an SDK state
 * directly (docs/05-ui-ux.md §9.2). */
export type AbstractState =
  | 'PASSIVE'
  | 'STAND'
  | 'MANUAL'
  | 'ASSISTED'
  | 'AUTO_MISSION'
  | 'RETURNING'
  | 'DOCKING'
  | 'FAULT'
  | 'E_STOP'

export type TelemetryFreshness = 'live' | 'stale' | 'missing'

/** Mirrors shared/schemas/bridge_status.py's Posture. "unknown" is NOT a
 *  synonym for upright -- a gRPC-only bridge has no IMU and always reports it,
 *  which is why Get Up is also permanently available in Diagnostics. */
export type Posture = 'upright' | 'fallen' | 'unknown'

/** Mirrors shared/schemas/bridge_status.py's LegConfig: the bridge's reading
 *  of the rear knee angles, since CHANGE_MODE is a blind toggle. "unknown" is
 *  NOT a synonym for normal. Read it through liveops/legConfig.ts. */
export type LegConfig = 'normal' | 'x' | 'unknown'

export type LinkStatus = 'connected' | 'reconnecting' | 'offline'
export type SdkLinkStatus = 'connected' | 'degraded' | 'unavailable'
export type DdsLinkStatus = 'connected' | 'reconnecting' | 'unavailable'

/** Mirrors shared/schemas/robot_state.py. Three orthogonal axes: `provider` is
 * what produced the estimate, `quality` is whether to trust it, `freshness` is
 * how recent it is. A SLAM provider that has lost lock is still
 * provider: 'slam' with quality: 'lost'. */
export type PositionProviderKind = 'dead_reckoning' | 'slam' | 'gps'
export type PositionQuality = 'estimated' | 'localized' | 'lost'

export interface RobotPosition {
  x_m: number
  y_m: number
  z_m: number
  heading_deg: number
  provider: PositionProviderKind
  quality: PositionQuality
  /** null means "not measured", never "perfect". */
  accuracy_m: number | null
  freshness: TelemetryFreshness
  updated_at: string
}

export interface RobotConnectivity {
  robot_to_edge: DdsLinkStatus
  edge_to_cloud: LinkStatus
  bridge_state: LinkStatus
  bridge_latency_ms: number | null
  dds: DdsLinkStatus
  grpc: SdkLinkStatus
}

export interface RobotBattery {
  /** null means "no reading", NOT "empty". gRPC's GetRobotStateResponse has no
   * battery field at all, so the value exists only when the edge bridge's DDS
   * BMS subscription (E6) is enabled and delivering — a gRPC-only deployment
   * never knows it. Render via `formatBatteryPercent` in
   * `@/liveops/batteryDisplay`; never interpolate it directly, or an unknown
   * battery prints as "null%". Compare against thresholds only after an
   * explicit null check: `null < 30` is false in JS, so a bare comparison
   * treats unknown as healthy.
   * See docs/audit/2026-08-12-prd-vs-sdk-direction-audit.md F1. */
  percent: number | null
  est_runtime_min: number
  charging: boolean
}

/** Mirrors shared/schemas/bridge_status.py's ActiveRun. */
export interface ActiveRun {
  run_id: string
  status: 'running' | 'paused'
  step_label: string | null
  block_id: string | null
  started_at: string
  /** While paused: the step that will be redone on resume. */
  redo_step_label: string | null
}

export type GaitMode = 'walk' | 'flying_trot' | 'wheel_loco'

export type RobotType = 'quad' | 'wheel'

/** Body-motion and per-joint telemetry from the SDK's get_state() RobotState
 * message (grpc_service.proto) beyond pos_body/vel_body -- present once a
 * real telemetry frame carrying these fields has arrived (see
 * RealDataProvider.handleTelemetryMessage); absent for mock robots and for
 * a real robot before its first frame. jpos_leg/jvel_leg/jtau_leg are 12
 * raw values (one per leg joint on the quad) in SDK order -- the vendored
 * SDK docs don't document a per-leg/per-joint index mapping, so these are
 * shown generically rather than fabricating a leg/joint-name association. */
export interface RobotPhysicsTelemetry {
  acc_body: [number, number, number]
  omega_body: [number, number, number]
  ori_body: [number, number, number]
  jpos_leg: number[]
  jvel_leg: number[]
  jtau_leg: number[]
  grf_left: [number, number, number]
  grf_right: [number, number, number]
}

/** rt/lower/state's IMU sub-message (E4) -- DDS-only, unreachable via
 * gRPC. See shared/schemas/low_level_telemetry.py's ImuState. */
export interface RobotImuState {
  quaternion: [number, number, number, number] // w, x, y, z
  gyroscope: [number, number, number] // rad/s
  accelerometer: [number, number, number] // m/s^2
  rpy: [number, number, number] // rad
}

/** One of 16 entries in rt/lower/state's motor array (E5) -- richer than
 * RobotPhysicsTelemetry's 12 gRPC-derived joint values: includes mode and
 * motor_temp, neither of which gRPC's get_state() exposes at all. See
 * shared/schemas/low_level_telemetry.py's MotorState. */
export interface RobotMotorState {
  mode: number
  q: number
  dq: number
  ddq: number
  tau_est: number
  q_raw: number
  dq_raw: number
  ddq_raw: number
  motor_temp: number
}

/** Published by the edge bridge's low_level_reader.py to roverhub/{site_id}/
 * {robot_id}/lower_state -- only present when the edge bridge is running
 * with LOW_LEVEL_DDS_ENABLED=true on a Jetson/Raspberry Pi wired to the
 * robot's DDS network (docs/09-low-level-sdk.md). battery_level is BMS's
 * only field the Python DDS bindings expose. */
export interface RobotLowerState {
  imu: RobotImuState
  motors: RobotMotorState[] // length 16, see low_level.md's motor numbering table
  battery_level: number
}

/** What the robot's edge bridge has told us about itself: its retained
 * registration (`roverhub/admin/{bridge_id}/register`, connection_manager.py)
 * plus its latest `/heartbeat` (HeartbeatPayload in
 * shared/schemas/bridge_status.py). Everything here is genuinely reported —
 * host facts the bridge does not publish yet (hostname, OS, uptime, its own
 * version) are deliberately absent rather than defaulted. */
/** Mirrors shared/schemas/bridge_status.py EdgeHostInfo (0.0.9), sent once
 * in the bridge's registration. null means "couldn't read it on this host". */
export interface EdgeHostInfo {
  hostname: string | null
  os: string | null
  kernel: string | null
  arch: string | null
  device_model: string | null
  bridge_version: string | null
  booted_at: string | null
  bridge_started_at: string | null
}

/** Mirrors EdgeHostMetrics (0.0.9), sent with every heartbeat. null means
 * unreadable, never zero; cpu_percent is null on the first heartbeat. */
export interface EdgeHostMetrics {
  cpu_percent: number | null
  memory_percent: number | null
  memory_total_bytes: number | null
  soc_temp_c: number | null
  disk_free_bytes: number | null
  disk_total_bytes: number | null
}

/** Whether the backend has let this device in (GET /robots `acceptance`).
 * Informational only: it gates no command, E-Stop included. */
export type DeviceAcceptance = 'accepted' | 'pending' | 'rejected'

export interface RobotBridgeInfo {
  bridge_id: string
  /** Wire-contract version from the registration; null until one arrives. */
  schema_version: string | null
  /** The heartbeat's own timestamp; null until the first heartbeat. */
  last_heartbeat_at: string | null
  mission_active: boolean
  /** Latest payloads verbatim, for the developer panel. */
  raw_registration?: Record<string, unknown>
  raw_heartbeat?: Record<string, unknown>
  /** From the registration; absent from bridges older than 0.0.9. */
  host?: EdgeHostInfo | null
  /** From the latest heartbeat; absent from bridges older than 0.0.9. */
  host_metrics?: EdgeHostMetrics | null
  /** From the backend registry; absent until it has been asked. */
  acceptance?: DeviceAcceptance
}

export interface RobotState {
  robot_id: string
  name: string
  site_id: string
  robot_type: RobotType
  /** The robot's own gRPC address, e.g. "10.0.12.65:50051" — matches the
   * edge bridge's ROBOT_IP config (dobot_adapter.py's RobotClient(robot_ip)).
   * The SDK has no discovery mechanism (RobotClient always connects to a
   * known address; the gRPC service exposes no "find robots on LAN" RPC),
   * so this is entered manually when registering a robot. */
  ip_address?: string
  abstract_state: AbstractState
  posture: Posture
  /** Absent from bridges older than schema 0.0.12, which means unknown. */
  leg_config?: LegConfig
  /** Present in the mock payload to prove the SDK boundary; must never be rendered. */
  sdk_state: string
  battery: RobotBattery
  position: RobotPosition
  speed_mps: number
  /** SDK's base speed_ratio (10-100, get_state()'s current_speed_ratio) --
   * distinct from speed_mps (actual measured velocity magnitude). This is
   * the persistent setting SET_SPEED_RATIO changes; VELOCITY_SEQUENCE bursts
   * can temporarily override it for one call, but it always reverts to this
   * value once the burst completes (see high_level.md §2.6). */
  speed_ratio: number
  gait: GaitMode
  obstacle_avoidance: boolean
  connectivity: RobotConnectivity
  /** Undefined until a real telemetry frame carrying this data has arrived
   * (see RobotPhysicsTelemetry doc) -- never fabricated for mock robots. */
  physics?: RobotPhysicsTelemetry
  /** Undefined unless the edge bridge is low-level-enabled and at least one
   * lower_state message has arrived (see RobotLowerState doc). The mock
   * provider seeds one robot with a sample so Fleet's motor view can be
   * reviewed without hardware. */
  lowerState?: RobotLowerState
  maintenance_flagged: boolean
  highest_alert_id?: string
  /** Operator currently holding manual/assisted teleoperation authority, or
   * null if no one does (docs/01-prd.md §16.4: only one active control owner
   * per robot). Set by TAKE_CONTROL, cleared by RELEASE_CONTROL or the
   * auto-release timeout. */
  control_owner: string | null
  /** The mission run the bridge is executing, from retained /state; null when none. */
  active_run: ActiveRun | null
  /** The bridge process id; changes when the bridge restarts. */
  bridge_boot_id: string | null
  available_motions: string[]
  /** Undefined until the robot's bridge has registered or sent a heartbeat. */
  bridge?: RobotBridgeInfo
  updated_at: string
}

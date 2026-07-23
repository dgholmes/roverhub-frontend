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

export type LinkStatus = 'connected' | 'reconnecting' | 'offline'
export type SdkLinkStatus = 'connected' | 'degraded' | 'unavailable'
export type DdsLinkStatus = 'connected' | 'reconnecting' | 'unavailable'

export interface RobotPosition {
  x_m: number
  y_m: number
  heading_deg: number
  /** MVP has no GPS — all positions are dead-reckoned (docs/05-ui-ux.md §7.1). */
  provider: 'dead_reckoning'
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
  percent: number
  est_runtime_min: number
  charging: boolean
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
  /** Present in the mock payload to prove the SDK boundary; must never be rendered. */
  sdk_state: string
  battery: RobotBattery
  position: RobotPosition
  speed_mps: number
  gait: GaitMode
  obstacle_avoidance: boolean
  connectivity: RobotConnectivity
  /** Undefined until a real telemetry frame carrying this data has arrived
   * (see RobotPhysicsTelemetry doc) -- never fabricated for mock robots. */
  physics?: RobotPhysicsTelemetry
  maintenance_flagged: boolean
  highest_alert_id?: string
  /** Operator currently holding manual/assisted teleoperation authority, or
   * null if no one does (docs/01-prd.md §16.4: only one active control owner
   * per robot). Set by TAKE_CONTROL, cleared by RELEASE_CONTROL or the
   * auto-release timeout. */
  control_owner: string | null
  available_motions: string[]
  updated_at: string
}

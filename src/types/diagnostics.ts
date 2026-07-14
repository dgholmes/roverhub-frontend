/**
 * PROVISIONAL — no shared/schemas/*.py covers per-joint diagnostics yet.
 * Field shape is grounded in the vendored Dobot Quad SDK
 * (edge/vendor/dobot_quad_sdk), not invented: `low_level/python/e5_motor_state_sub.py`
 * confirms each of the SDK's 16 motors exposes `mode()`, `q()` (position,
 * rad), `dq()` (velocity, rad/s), `tau_est()` (torque, N·m), and
 * `motor_temp()` (°C) — there is no separate MCU-temp/MOS-temp reading in
 * the vendored SDK, unlike the reference app's UI, so this deliberately
 * does not fabricate that split. Joint Limits (position/torque/speed/KP/KD)
 * and Version Info mirror the reference app's own information architecture
 * rather than a confirmed SDK query — there is no "get versions" or
 * "get joint limits" RPC in the vendored SDK's 5-method gRPC service.
 */

export type Leg = 'front_left' | 'front_right' | 'rear_left' | 'rear_right'
export type JointErrorFlag = 'normal' | 'warning' | 'fault'

export interface MotorDiagnostics {
  joint_id: string
  leg: Leg
  joint_name: 'hip' | 'thigh' | 'knee'
  mode: string
  position_deg: number
  velocity_dps: number
  torque_nm: number
  motor_temp_c: number
  error_flag: JointErrorFlag
}

export interface JointLimit {
  joint_id: string
  leg: Leg
  joint_name: 'hip' | 'thigh' | 'knee'
  position_range_deg: [number, number]
  torque_range_nm: [number, number]
  speed_range_dps: [number, number]
  kp: number
  kd: number
}

export interface VersionInfo {
  algorithm: string
  can_board: string
  bms: string
  controller: string
  system: string
  battery_group: string
  audio: string
  servo_by_leg: Record<Leg, string>
}

export interface FirmwareUpdate {
  current_version: string
  available_version: string | null
  size_mb: number | null
  release_notes: string[]
}

export interface TrafficStatus {
  status_4g: 'enabled' | 'disabled'
  remaining_mb: number
  card_id: string
}

export interface FootTypeInfo {
  current: string
  options: string[]
}

export interface RobotDiagnostics {
  robot_id: string
  version: VersionInfo
  joints: MotorDiagnostics[]
  jointLimits: JointLimit[]
  footType: FootTypeInfo
  traffic: TrafficStatus
  firmware: FirmwareUpdate
  last_calibrated_at: string | null
}

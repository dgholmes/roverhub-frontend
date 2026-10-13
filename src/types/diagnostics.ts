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
  /** Undefined when built from real gRPC telemetry (jpos_leg/jvel_leg/
   * jtau_leg) rather than mock data -- get_state() has no motor
   * temperature or fault-flag field at all (DDS-only, not wired). */
  motor_temp_c?: number
  error_flag?: JointErrorFlag
}

import type { Leg, MotorDiagnostics, RobotPhysicsTelemetry } from '@/types'

const LEGS: Leg[] = ['front_left', 'front_right', 'rear_left', 'rear_right']
const JOINT_NAMES = ['hip', 'thigh', 'knee'] as const

const RAD_TO_DEG = 180 / Math.PI

/**
 * Maps real telemetry's flat 12-value jpos_leg/jvel_leg/jtau_leg arrays onto
 * the same front_left/front_right/rear_left/rear_right x hip/thigh/knee
 * layout motorLayout.ts uses to build joint_ids for the illustrated
 * diagram's ANCHORS. The 12-value count matches exactly, but the vendored
 * SDK's grpc_service.proto documents these arrays only as `repeated float`
 * with no published index-to-joint mapping -- this ordering (grouped by
 * leg, then hip/thigh/knee within each leg) is a common quadruped-SDK
 * convention, not SDK-confirmed. Callers must present this as inferred.
 *
 * jpos_leg/jvel_leg are in radians/rad-per-second per high_level.md's field
 * table; converted to degrees/deg-per-second here to match MotorDiagnostics'
 * position_deg/velocity_dps (and the diagram's existing ° formatting).
 * jtau_leg is already N·m, matching torque_nm directly.
 *
 * motor_temp_c/error_flag are omitted (undefined) -- get_state() has no
 * such fields at all (DDS-only, not wired).
 */
export function jointDiagnosticsFromPhysics(physics: RobotPhysicsTelemetry): MotorDiagnostics[] {
  return LEGS.flatMap((leg, legIdx) =>
    JOINT_NAMES.map((joint_name, jointIdx) => {
      const i = legIdx * JOINT_NAMES.length + jointIdx
      return {
        joint_id: `${leg}_${joint_name}`,
        leg,
        joint_name,
        mode: 'servo',
        position_deg: (physics.jpos_leg[i] ?? 0) * RAD_TO_DEG,
        velocity_dps: (physics.jvel_leg[i] ?? 0) * RAD_TO_DEG,
        torque_nm: physics.jtau_leg[i] ?? 0,
      } satisfies MotorDiagnostics
    }),
  )
}

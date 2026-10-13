import i18n from '@/i18n'
import type { Leg, MotorDiagnostics, RobotMotorState, RobotType } from '@/types'

/**
 * Lays DDS lower_state's 16 motors out by leg.
 *
 * The leg grouping is SDK-documented (low_level.md "Motor Numbering": front
 * left 0–3, front right 4–7, rear left 8–11, rear right 12–15), unlike the
 * gRPC jpos_leg ordering, which is inferred (jointDiagramMapping.ts).
 *
 * Within a leg, the E9 example drives indices 0–2 of each group as the 12
 * actuated joints (ABS2HW = [0,1,2, 4,5,6, ...]) and leaves index 3 alone, so
 * index 3 is the wheel on a wheel robot and idle on a point-foot one. Naming
 * 0–2 hip, thigh and knee is our reading of E9's zero-offset table (≈0 rad,
 * ±0.5 rad, ±1.17 rad — abduction, upper leg, lower leg); the SDK does not
 * name them.
 */
export const LEGS: Leg[] = ['front_left', 'front_right', 'rear_left', 'rear_right']
export const LEG_SHORT: Record<Leg, string> = {
  front_left: 'FL', front_right: 'FR', rear_left: 'RL', rear_right: 'RR',
}
export const JOINTS = ['hip', 'thigh', 'knee'] as const
export type JointName = typeof JOINTS[number]

export interface LegMotor {
  leg: Leg
  /** hip / thigh / knee, or 'wheel' for index 3 on a wheel robot. */
  joint: JointName | 'wheel'
  /** Index into lower_state's motor array. */
  index: number
  motor: RobotMotorState
}

/** Motors grouped by leg, in hip → thigh → knee (→ wheel) order. Index 3 of
 * each leg is included only for wheel robots. Missing motors are skipped. */
export function motorsByLeg(motors: RobotMotorState[], robotType: RobotType): Record<Leg, LegMotor[]> {
  const out = {} as Record<Leg, LegMotor[]>
  LEGS.forEach((leg, legIdx) => {
    const joints: (JointName | 'wheel')[] = robotType === 'wheel' ? [...JOINTS, 'wheel'] : [...JOINTS]
    out[leg] = joints.flatMap((joint, j) => {
      const index = legIdx * 4 + j
      const motor = motors[index]
      return motor ? [{ leg, joint, index, motor }] : []
    })
  })
  return out
}

/** "FL knee" */
export function legMotorLabel(m: Pick<LegMotor, 'leg' | 'joint'>): string {
  return i18n.t('fleetDetail.legJoint', { leg: LEG_SHORT[m.leg], joint: i18n.t(`fleetDetail.joint.${m.joint}`) })
}

/** The 12 leg joints as MotorDiagnostics for the illustrated JointDiagram,
 * carrying the real motor temperature that gRPC joint data lacks. */
export function jointDiagnosticsFromMotors(motors: RobotMotorState[]): MotorDiagnostics[] {
  return LEGS.flatMap((leg, legIdx) =>
    JOINTS.flatMap((joint_name, j) => {
      const m = motors[legIdx * 4 + j]
      if (!m) return []
      return [{
        joint_id: `${leg}_${joint_name}`,
        leg,
        joint_name,
        mode: String(m.mode),
        position_deg: (m.q * 180) / Math.PI,
        velocity_dps: (m.dq * 180) / Math.PI,
        torque_nm: m.tau_est,
        motor_temp_c: m.motor_temp,
      } satisfies MotorDiagnostics]
    }),
  )
}

/** The hottest leg motor, by name ("FL knee"), or null without DDS motor
 * data. Index 3 of each leg is skipped on a point-foot robot, where it
 * drives nothing. */
export function hottestLegMotor(
  robot: { lowerState?: { motors: RobotMotorState[] }; robot_type: RobotType },
): { label: string; tempC: number } | null {
  if (!robot.lowerState) return null
  const legs = motorsByLeg(robot.lowerState.motors, robot.robot_type)
  const all = LEGS.flatMap((l) => legs[l])
  if (all.length === 0) return null
  const hottest = all.reduce((a, b) => (b.motor.motor_temp > a.motor.motor_temp ? b : a))
  return { label: legMotorLabel(hottest), tempC: hottest.motor.motor_temp }
}

/** "Front Left" from "front_left", in the current language. */
export function legLabel(leg: Leg): string {
  return i18n.t(`fleetDetail.leg.${leg}`)
}

/** A joint name standing on its own: "Knee". */
export function jointTitle(joint: JointName | 'wheel'): string {
  return i18n.t(`fleetDetail.jointTitle.${joint}`)
}

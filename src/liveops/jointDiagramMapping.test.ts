import { describe, expect, it } from 'vitest'
import { jointDiagnosticsFromPhysics } from './jointDiagramMapping'
import type { RobotPhysicsTelemetry } from '@/types'

function physics(overrides: Partial<RobotPhysicsTelemetry> = {}): RobotPhysicsTelemetry {
  return {
    acc_body: [0, 0, 0], omega_body: [0, 0, 0], ori_body: [0, 0, 0],
    jpos_leg: new Array(12).fill(0), jvel_leg: new Array(12).fill(0), jtau_leg: new Array(12).fill(0),
    grf_left: [0, 0, 0], grf_right: [0, 0, 0],
    ...overrides,
  }
}

describe('jointDiagnosticsFromPhysics', () => {
  it('produces 12 joints spanning all four legs x hip/thigh/knee', () => {
    const joints = jointDiagnosticsFromPhysics(physics())
    expect(joints).toHaveLength(12)
    expect(joints.map((j) => j.joint_id)).toEqual([
      'front_left_hip', 'front_left_thigh', 'front_left_knee',
      'front_right_hip', 'front_right_thigh', 'front_right_knee',
      'rear_left_hip', 'rear_left_thigh', 'rear_left_knee',
      'rear_right_hip', 'rear_right_thigh', 'rear_right_knee',
    ])
  })

  it('converts jpos_leg/jvel_leg from radians to degrees, keeps jtau_leg as N·m', () => {
    const jpos_leg = new Array(12).fill(0)
    const jvel_leg = new Array(12).fill(0)
    const jtau_leg = new Array(12).fill(0)
    jpos_leg[0] = Math.PI / 2 // 90 deg
    jvel_leg[0] = Math.PI // 180 deg/s
    jtau_leg[0] = 3.5

    const [first] = jointDiagnosticsFromPhysics(physics({ jpos_leg, jvel_leg, jtau_leg }))

    expect(first.position_deg).toBeCloseTo(90)
    expect(first.velocity_dps).toBeCloseTo(180)
    expect(first.torque_nm).toBe(3.5)
  })

  it('leaves motor_temp_c and error_flag undefined -- no gRPC equivalent exists', () => {
    const [first] = jointDiagnosticsFromPhysics(physics())
    expect(first.motor_temp_c).toBeUndefined()
    expect(first.error_flag).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import type { RobotMotorState } from '@/types'
import { jointDiagnosticsFromMotors, legMotorLabel, motorsByLeg } from './motorLayout'

const motors: RobotMotorState[] = Array.from({ length: 16 }, (_, i) => ({
  mode: 4, q: 0, dq: 0, ddq: 0, tau_est: i, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 30 + i,
}))

describe('motorsByLeg', () => {
  it('groups four motors per leg in SDK order and drops index 3 on a point-foot robot', () => {
    const legs = motorsByLeg(motors, 'quad')
    expect(legs.front_left.map((m) => m.index)).toEqual([0, 1, 2])
    expect(legs.rear_right.map((m) => m.index)).toEqual([12, 13, 14])
  })
  it('keeps index 3 as the wheel on a wheel robot', () => {
    const legs = motorsByLeg(motors, 'wheel')
    expect(legs.front_right.map((m) => [m.index, m.joint])).toEqual([[4, 'hip'], [5, 'thigh'], [6, 'knee'], [7, 'wheel']])
  })
  it('skips motors that are missing', () => {
    expect(motorsByLeg(motors.slice(0, 5), 'quad').front_right.map((m) => m.index)).toEqual([4])
  })
})

describe('jointDiagnosticsFromMotors', () => {
  it('builds the 12 leg joints with real temperatures', () => {
    const joints = jointDiagnosticsFromMotors(motors)
    expect(joints).toHaveLength(12)
    expect(joints[2]).toMatchObject({ joint_id: 'front_left_knee', motor_temp_c: 32 })
    expect(joints[3]).toMatchObject({ joint_id: 'front_right_hip', motor_temp_c: 34 })
  })
})

it('labels a motor by leg and joint', () => {
  expect(legMotorLabel({ leg: 'front_left', joint: 'knee' })).toBe('FL knee')
})

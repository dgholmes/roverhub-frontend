import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import { applicablePostureActions, posturePhaseOf } from './postureContext'

const quad = (over: Partial<RobotState> = {}): RobotState =>
  ({ ...initialRobots[1], robot_type: 'quad', posture: 'upright', ...over })
const wheel = (over: Partial<RobotState> = {}): RobotState =>
  ({ ...initialRobots[1], robot_type: 'wheel', posture: 'upright', ...over })

const kinds = (robot: RobotState) => applicablePostureActions(robot).map((a) => a.kind)

describe('posturePhaseOf', () => {
  it('reads the type own sit, safe-stop and passive targets as down', () => {
    expect(posturePhaseOf(quad({ sdk_state: 'stand_down' }))).toBe('down')
    expect(posturePhaseOf(quad({ sdk_state: 'ready' }))).toBe('down')
    expect(posturePhaseOf(quad({ sdk_state: 'passive' }))).toBe('down')
  })

  it('reads the stand target, the velocity gaits and the motion states as up', () => {
    expect(posturePhaseOf(quad({ sdk_state: 'balance_stand' }))).toBe('up')
    expect(posturePhaseOf(quad({ sdk_state: 'walk' }))).toBe('up')
    expect(posturePhaseOf(quad({ sdk_state: 'flying_trot' }))).toBe('up')
    expect(posturePhaseOf(quad({ sdk_state: 'wave' }))).toBe('up')
    expect(posturePhaseOf(wheel({ sdk_state: 'wheel_loco' }))).toBe('up')
  })

  it('answers unknown for a state this build does not recognise', () => {
    expect(posturePhaseOf(quad({ sdk_state: 'no_such_state' }))).toBe('unknown')
  })

  it("never reads posture 'unknown' as upright", () => {
    expect(posturePhaseOf(quad({ sdk_state: 'ready', posture: 'unknown' }))).toBe('down')
    expect(posturePhaseOf(quad({ sdk_state: 'balance_stand', posture: 'unknown' }))).toBe('up')
  })

  it('answers fallen only for a type that can recover', () => {
    expect(posturePhaseOf(quad({ sdk_state: 'ready', posture: 'fallen' }))).toBe('fallen')
    expect(posturePhaseOf(wheel({ sdk_state: 'ready', posture: 'fallen' }))).toBe('down')
  })
})

describe('applicablePostureActions', () => {
  it('offers Stand alone to a quad lying down', () => {
    expect(kinds(quad({ sdk_state: 'ready' }))).toEqual(['stand'])
    expect(kinds(quad({ sdk_state: 'stand_down' }))).toEqual(['stand'])
    expect(kinds(quad({ sdk_state: 'passive' }))).toEqual(['stand'])
  })

  it('offers Sit and Safe stop, never Stand, to a robot standing or walking', () => {
    expect(kinds(quad({ sdk_state: 'balance_stand' }))).toEqual(['sit', 'safeStop'])
    expect(kinds(quad({ sdk_state: 'walk' }))).toEqual(['sit', 'safeStop'])
  })

  it('replaces the lot with Get up when the robot is fallen', () => {
    expect(kinds(quad({ sdk_state: 'ready', posture: 'fallen' }))).toEqual(['recovery'])
  })

  it('falls back to the phase for a fallen wheel robot, which cannot recover', () => {
    expect(kinds(wheel({ sdk_state: 'ready', posture: 'fallen' }))).toEqual(['stand'])
  })

  it('stands a wheel robot with wheel_loco, not balance_stand', () => {
    expect(kinds(wheel({ sdk_state: 'wheel_loco' }))).toEqual(['sit', 'safeStop'])
    expect(applicablePostureActions(wheel({ sdk_state: 'stand_down' }))[0].state).toBe('wheel_loco')
  })

  // The one that matters most: a state table this build has not caught up with
  // must leave every control on screen, not remove them.
  it('offers all three for an unrecognised sdk_state', () => {
    expect(kinds(quad({ sdk_state: 'no_such_state' }))).toEqual(['stand', 'sit', 'safeStop'])
  })
})

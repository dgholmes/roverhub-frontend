import { describe, expect, it } from 'vitest'
import { ackDeadlineMs, expectedDurationS } from './commandDeadline'

describe('expectedDurationS', () => {
  it('walks at 0.5 m/s scaled by the speed ratio', () => {
    expect(expectedDurationS('LINE_WALK', { distance: 1 }, 50)).toBeCloseTo(4)
    expect(expectedDurationS('LINE_WALK', { distance: 3 }, 10)).toBeCloseTo(60)
  })
  it('assumes 10% when the ratio is unknown or unusable', () => {
    expect(expectedDurationS('LINE_WALK', { distance: 1 })).toBeCloseTo(20)
    expect(expectedDurationS('LINE_WALK', { distance: 1 }, NaN)).toBeCloseTo(20)
    expect(expectedDurationS('LINE_WALK', { distance: 1 }, 0)).toBeCloseTo(20)
  })
  it('covers rotate, circle and poses', () => {
    expect(expectedDurationS('ROTATE', { angle: 90 })).toBe(2)
    expect(expectedDurationS('CIRCLE', { turns: 2 })).toBe(16)
    expect(expectedDurationS('DYNAMIC_POSE', { duration: 3 })).toBe(3)
    expect(expectedDurationS('STATIC_POSE', { duration: 5 })).toBe(5)
    expect(expectedDurationS('LED_SIGNAL', {})).toBe(0)
  })
})

describe('ackDeadlineMs', () => {
  it('gives safety commands 5 s', () => {
    expect(ackDeadlineMs('ESTOP')).toBe(5_000)
    expect(ackDeadlineMs('RELEASE_CONTROL')).toBe(5_000)
  })
  it('lets Release E-Stop run its stand-up chain', () => {
    // 2026-10-28: a Release that stood the robot up in 6.3 s showed "timed out".
    expect(ackDeadlineMs('RESET_ESTOP')).toBe(35_000)
  })
  it('gives a 3 m walk at 10% more than 60 s of margin', () => {
    expect(ackDeadlineMs('LINE_WALK', { distance: 3 }, 10)).toBeGreaterThan(60_000)
    expect(ackDeadlineMs('LINE_WALK', { distance: 3 }, 10)).toBe(90_000)
  })
  it('uses 30 s for SET_STATE and SPEAK, 35 s for TAKE_CONTROL, 15 s for the rest', () => {
    expect(ackDeadlineMs('SET_STATE')).toBe(30_000)
    expect(ackDeadlineMs('SPEAK')).toBe(30_000)
    // The bridge stands the robot up before it acks TAKE_CONTROL.
    expect(ackDeadlineMs('TAKE_CONTROL')).toBe(35_000)
    expect(ackDeadlineMs('LED_SIGNAL')).toBe(15_000)
  })
  it('gives SET_GAIT the same 30 s as SET_STATE', () => {
    expect(ackDeadlineMs('SET_GAIT', { gait: 'flying_trot' })).toBe(30_000)
  })
  it('waits out a gesture the bridge holds the command for', () => {
    // gongxi acked 9.5 s early with a flat 2 s settle (audit 4.2).
    expect(ackDeadlineMs('SET_STATE', { state: 'gongxi' })).toBe(41_500)
    expect(ackDeadlineMs('SET_STATE', { state: 'dance0' })).toBe(156_500)
    expect(ackDeadlineMs('SET_STATE', { state: 'balance_stand' })).toBe(30_000)
  })
  it('counts declared durations the bridge adds to its own budget', () => {
    expect(ackDeadlineMs('BALANCE_AXIS', { duration: 4 })).toBe(34_000)
    expect(ackDeadlineMs('VELOCITY_SEQUENCE', { steps: [[0.2, 0, 0, 10], [0, 0, 0.5, 20]] })).toBe(60_000)
    expect(ackDeadlineMs('BALANCE_SEQUENCE', { steps: [['balance_pitch', 5, 3, 'dynamic']] })).toBe(33_000)
  })
})

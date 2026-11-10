import { describe, expect, it } from 'vitest'
import { DEV_OPERATOR_ID as OPERATOR_ID } from '@/lib/realtime/operator'
import { isMissionOwner, isNavOwner, operatorHoldsControl } from './controlOwner'

describe('operatorHoldsControl', () => {
  it('test_true_only_for_this_operator', () => {
    expect(operatorHoldsControl({ control_owner: OPERATOR_ID })).toBe(true)
  })

  it('test_false_for_a_mission_owner', () => {
    // A running mission holds control as mission:<run_id>. The drive overlay and
    // its 60 s deadman must never mount for it: the deadman's RELEASE_CONTROL
    // would be refused, and the drive pad would fight the program.
    expect(operatorHoldsControl({ control_owner: 'mission:r1' })).toBe(false)
  })

  it('test_false_for_nobody_and_for_another_operator', () => {
    expect(operatorHoldsControl({ control_owner: null })).toBe(false)
    expect(operatorHoldsControl({ control_owner: 'operator-b' })).toBe(false)
    expect(operatorHoldsControl(undefined)).toBe(false)
  })
})

describe('isMissionOwner', () => {
  it('recognises mission owners only', () => {
    expect(isMissionOwner('mission:r1')).toBe(true)
    expect(isMissionOwner(OPERATOR_ID)).toBe(false)
    expect(isMissionOwner(null)).toBe(false)
  })
})

describe('isNavOwner', () => {
  it('recognises a nav goal holding control, and nothing else', () => {
    expect(isNavOwner('nav:8f2c')).toBe(true)
    expect(isNavOwner('mission:r1')).toBe(false)
    expect(isNavOwner(OPERATOR_ID)).toBe(false)
    expect(isNavOwner(null)).toBe(false)
    expect(isNavOwner(undefined)).toBe(false)
  })

  it('never reads a nav goal as this operator holding control', () => {
    expect(operatorHoldsControl({ control_owner: 'nav:8f2c' })).toBe(false)
  })
})

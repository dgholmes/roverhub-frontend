import { describe, expect, it } from 'vitest'
import { hottestMotor, motorHeat } from './motorHeat'

describe('motorHeat', () => {
  it('bands temperatures', () => {
    expect(motorHeat(40)).toBe('normal')
    expect(motorHeat(52)).toBe('warm')
    expect(motorHeat(61)).toBe('hot')
  })
})

describe('hottestMotor', () => {
  it('finds the hottest', () => expect(hottestMotor([30, 58, 41])).toEqual({ index: 1, tempC: 58 }))
  it('is null for no motors', () => expect(hottestMotor([])).toBeNull())
})

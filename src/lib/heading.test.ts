import { describe, expect, it } from 'vitest'
import { headingFromYaw } from './heading'

describe('headingFromYaw', () => {
  it('converts radians to degrees', () => {
    expect(headingFromYaw(Math.PI / 2)).toBeCloseTo(90)
  })
  it('wraps negative yaw into 0–360, matching Python modulo', () => {
    expect(headingFromYaw(-Math.PI / 2)).toBeCloseTo(270)
  })
  it('wraps past a full turn', () => {
    expect(headingFromYaw(2 * Math.PI + 0.1)).toBeCloseTo((0.1 * 180) / Math.PI)
  })
  it('treats a non-finite yaw as 0 rather than NaN', () => {
    expect(headingFromYaw(Number.NaN)).toBe(0)
  })
})

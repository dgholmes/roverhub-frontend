import { describe, expect, it } from 'vitest'
import {
  BAND_LIMITS, boxFromRect, boxWorld, clampBand, countInBoxes, fromMapBox, inBox, rectFromCorners, rectUsable, toMapBox,
} from './boxSelect'

describe('box select', () => {
  it('makes a rectangle from a drag in any direction, and calls a tiny one a click', () => {
    expect(rectFromCorners({ x: 3, y: 1 }, { x: 1, y: 4 })).toEqual({ x0: 1, y0: 1, x1: 3, y1: 4 })
    expect(rectUsable({ x0: 0, y0: 0, x1: 0.5, y1: 0.5 })).toBe(true)
    expect(rectUsable({ x0: 0, y0: 0, x1: 0.5, y1: 0.01 })).toBe(false)
  })

  it('puts a height band in order, inside the kept cloud, and never flat', () => {
    expect(clampBand(2, 0.5)).toEqual([0.5, 2])
    expect(clampBand(-5, 9)).toEqual([BAND_LIMITS[0], BAND_LIMITS[1]])
    const [lo, hi] = clampBand(1, 1)
    expect(hi - lo).toBeCloseTo(0.01)
    const [lo2, hi2] = clampBand(BAND_LIMITS[1], BAND_LIMITS[1])
    expect(hi2).toBe(BAND_LIMITS[1])
    expect(hi2 - lo2).toBeCloseTo(0.01)
    expect(clampBand(NaN, NaN)).toEqual([-0.1, 2.2])
  })

  it('turns heights above the floor into map z and back', () => {
    const box = boxFromRect({ x0: 1, y0: 2, x1: 3, y1: 4 }, [0, 1.8])
    expect(box).toEqual({ min: [1, 2, 0], max: [3, 4, 1.8] })
    const map = toMapBox(box, -0.34)
    expect(map.min[2]).toBeCloseTo(-0.34)
    expect(map.max[2]).toBeCloseTo(1.46)
    const back = fromMapBox(map, -0.34)
    expect(back.min[2]).toBeCloseTo(0)
    expect(back.max[2]).toBeCloseTo(1.8)
  })

  it('counts each point once, edges included, across overlapping boxes', () => {
    const pts = Float32Array.from([
      0, 0, 0, // on a corner of A
      0.5, 0.5, 0.5, // inside A and B
      2, 2, 2, // inside B only
      5, 5, 5, // in neither
    ])
    const A = { min: [0, 0, 0], max: [1, 1, 1] }
    const B = { min: [0.4, 0.4, 0.4], max: [2, 2, 2] }
    expect(inBox(1, 1, 1, A)).toBe(true)
    expect(countInBoxes(pts, [A])).toBe(2)
    expect(countInBoxes(pts, [A, B])).toBe(3)
    expect(countInBoxes(pts, [])).toBe(0)
  })

  it('places a box in world space as the scene does (X = x, Y = height, Z = -y)', () => {
    expect(boxWorld({ min: [1, 2, 0], max: [3, 6, 2] })).toEqual({ center: [2, 1, -4], size: [2, 2, 4] })
  })
})

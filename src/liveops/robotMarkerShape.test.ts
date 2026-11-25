import { describe, expect, it } from 'vitest'
import {
  MIN_BODY_PX, beamCornerPx, beamGradientBox, beamPath, beamReachPx, bodySizePx,
  haloRadiusPx, markerExtentPx, roundedBodyPath,
} from './robotMarkerShape'
import { ROBOT_BODY_LENGTH_M, ROBOT_BODY_WIDTH_M } from './robotBody'
import { bodyRotationDeg, markerRotationDeg } from './mapCoords'

describe('bodySizePx', () => {
  it('draws the body at true scale when there is room for it', () => {
    // 100 px/m: the 0.65 x 0.35 m body is 65 x 35 px.
    expect(bodySizePx(100)).toEqual({ lengthPx: 65, widthPx: 35 })
  })

  it('keeps the body in proportion at every scale', () => {
    for (const ppm of [8, 30, 58, 140]) {
      const { lengthPx, widthPx } = bodySizePx(ppm)
      expect(widthPx / lengthPx).toBeCloseTo(ROBOT_BODY_WIDTH_M / ROBOT_BODY_LENGTH_M, 6)
    }
  })

  // Zoomed out to the whole floor the true body is a couple of pixels, which
  // is not findable. It stops shrinking instead.
  it('stops shrinking at the floor size', () => {
    expect(bodySizePx(2).lengthPx).toBe(MIN_BODY_PX)
    expect(bodySizePx(0).lengthPx).toBe(MIN_BODY_PX)
  })

  it('takes a smaller floor for a robot that is not the selected one', () => {
    expect(bodySizePx(2, 12).lengthPx).toBe(12)
  })

  it('is true scale exactly where the floor stops binding', () => {
    const ppm = MIN_BODY_PX / ROBOT_BODY_LENGTH_M
    expect(bodySizePx(ppm).lengthPx).toBeCloseTo(MIN_BODY_PX, 6)
    expect(bodySizePx(ppm * 2).lengthPx).toBeCloseTo(MIN_BODY_PX * 2, 6)
  })

  it('never returns a non-finite size for a bad scale', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(bodySizePx(bad).lengthPx).toBe(MIN_BODY_PX)
    }
  })
})

describe('roundedBodyPath', () => {
  it('is a closed path', () => {
    const d = roundedBodyPath(60, 32)
    expect(d.startsWith('M')).toBe(true)
    expect(d.trimEnd().endsWith('Z')).toBe(true)
  })

  it('reaches the body half-length and half-width, and no further', () => {
    const d = roundedBodyPath(60, 32)
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    // Pairs alternate x, y through the path; the extremes are the body box.
    expect(Math.max(...nums)).toBeCloseTo(30, 6)
    expect(Math.min(...nums)).toBeCloseTo(-30, 6)
  })

  it('rounds no more than the body can take', () => {
    // A radius larger than the half-width would invert the corners.
    expect(() => roundedBodyPath(60, 32, 999)).not.toThrow()
    const d = roundedBodyPath(60, 32, 999)
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    expect(Math.max(...nums)).toBeCloseTo(30, 6)
  })
})

describe('beamPath', () => {
  it('opens symmetrically about the nose', () => {
    const d = beamPath(100, 30)
    expect(d.startsWith('M0,0')).toBe(true)
    expect(d).toContain('A100,100')
    expect(d.trimEnd().endsWith('Z')).toBe(true)
  })

  it('points along +x, which is the robot nose before rotation', () => {
    const d = beamPath(100, 0)
    // With no spread both arc ends sit straight ahead.
    expect(d).toContain('100,0')
  })

  // A sector drawn from the centre is widest and most opaque exactly where the
  // body is, which reads as a triangle stuck to the nose.
  it('given an inner radius, starts at the nose instead of the centre', () => {
    const d = beamPath(100, 30, 20)
    expect(d.startsWith('M0,0')).toBe(false)
    // Both radii appear, so it is an annular wedge and not a sector.
    expect(d).toContain('A100,100')
    expect(d).toContain('A20,20')
  })

  it('keeps the inner edge off the body centre', () => {
    const d = beamPath(100, 30, 20)
    const first = d.slice(1, d.indexOf(' ')).split(',').map(Number)
    // Coordinates are rounded to 2 dp in the path, so that is the precision.
    expect(Math.hypot(first[0]!, first[1]!)).toBeCloseTo(20, 2)
  })
})

/** Every end point in a path: M and L take one pair, A takes its last. */
function endPoints(d: string): [number, number][] {
  return (d.match(/[MLA][^MLAZ]*/g) ?? []).map((cmd) => {
    const pairs = [...cmd.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
    const last = pairs[pairs.length - 1]!
    return [Number(last[1]), Number(last[2])]
  })
}

// "Exactly as built, with the gradient exactly the same, but with the rounded
// curves" (user, 2026-11-25): the same wedge from the nose, corners rounded.
describe('beamPath with rounded corners', () => {
  const R = 100, inner = 20, rho = 5, spread = 30
  const d = beamPath(R, spread, inner, rho)

  it('rounds all four corners', () => {
    expect(d.match(/A5,5 /g)).toHaveLength(4)
  })

  it('keeps the round front and the round start at the nose', () => {
    expect(d).toContain('A100,100')
    expect(d).toContain('A20,20')
    expect(d.startsWith('M0,0')).toBe(false)
  })

  // Rounding takes corners off; it must never push the beam past the wedge
  // as built -- not further out, not nearer the body, not wider.
  it('stays inside the beam as built', () => {
    const limit = (spread * Math.PI) / 180 + 1e-3
    for (const [x, y] of endPoints(d)) {
      const r = Math.hypot(x, y)
      expect(r).toBeLessThanOrEqual(R + 0.02)
      expect(r).toBeGreaterThanOrEqual(inner - 0.02)
      expect(Math.abs(Math.atan2(y, x))).toBeLessThanOrEqual(limit)
    }
  })

  it('still meets the front circle and the circle at the nose', () => {
    const radii = endPoints(d).map(([x, y]) => Math.hypot(x, y))
    expect(radii.some((r) => Math.abs(r - R) < 0.02)).toBe(true)
    expect(radii.some((r) => Math.abs(r - inner) < 0.02)).toBe(true)
  })

  it('is the sharp wedge when no corner radius is given', () => {
    expect(beamPath(R, spread, inner)).toBe(beamPath(R, spread, inner, 0))
    expect(beamPath(R, spread, inner).match(/ A/g)).toHaveLength(2)
  })

  it('does not round more than the narrow end can take', () => {
    expect(() => beamPath(R, spread, inner, 999)).not.toThrow()
    for (const [x, y] of endPoints(beamPath(R, spread, inner, 999))) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    }
  })
})

describe('beamCornerPx', () => {
  it('is slight: a tenth of the body, never under 2 px', () => {
    expect(beamCornerPx(60)).toBeCloseTo(6, 6)
    expect(beamCornerPx(10)).toBe(2)
  })
})

describe('beamGradientBox', () => {
  // The gradient was fitted to the sharp wedge's own box. Rounding shrinks
  // that box, which would move the fade; pinning it here is what keeps the
  // gradient exactly as it was (user, 2026-11-25).
  it('is the box of the beam as built, not of the rounded one', () => {
    const box = beamGradientBox(100, 30, 20)
    const x0 = 20 * Math.cos(Math.PI / 6)
    expect(box.cx).toBeCloseTo((x0 + 100) / 2, 6)
    expect(box.rx).toBeCloseTo((100 - x0) / 2, 6)
    expect(box.ry).toBeCloseTo(50, 6)
  })
})

describe('reach, halo and extent', () => {
  it('keeps the beam short of anything that could read as sensor range', () => {
    // At true scale the beam is a few body lengths, never tens of metres.
    const ppm = 58
    const { lengthPx } = bodySizePx(ppm)
    expect(beamReachPx(lengthPx) / ppm).toBeLessThan(2.5)
  })

  it('still shows a beam when the body is at its floor size', () => {
    expect(beamReachPx(MIN_BODY_PX)).toBeGreaterThan(MIN_BODY_PX)
  })

  it('sizes the halo around the body', () => {
    expect(haloRadiusPx(60)).toBeGreaterThan(60 / 2)
  })

  it('makes the icon box cover the beam, the halo and the body', () => {
    const extent = markerExtentPx({ lengthPx: 60, beamPx: 150, haloPx: 90 })
    expect(extent).toBeGreaterThanOrEqual(150)
    expect(markerExtentPx({ lengthPx: 60, beamPx: 0, haloPx: 0 })).toBeGreaterThanOrEqual(30)
  })
})

describe('bodyRotationDeg', () => {
  // The body is drawn along +x (nose to the right), unlike the old arrow,
  // which was drawn pointing up. Rotating a right-pointing shape by the
  // arrow's angle would have it face south at heading 0.
  it('leaves a body facing east unrotated', () => {
    expect(bodyRotationDeg(0)).toBe(0)
  })

  it('turns a body facing north to point up the screen', () => {
    expect(bodyRotationDeg(90)).toBe(-90)
  })

  it('is not the up-pointing arrow rule', () => {
    expect(bodyRotationDeg(90)).not.toBe(markerRotationDeg(90))
  })
})

import { describe, expect, it } from 'vitest'
import {
  MotionEstimator, buildPyramid, findCorners, fitSimilarity, greyFromRgba, trackPoint, type GreyImage,
} from './motion'

/** A textured test scene: blobs of many sizes at pseudo-random places, so
 * there are corners everywhere and no repeating pattern to alias on (a real
 * corridor has posters, door frames and clutter, not a checkerboard).
 * Deterministic, so a failing test fails the same way every time. */
export function scene(width: number, height: number): (x: number, y: number) => number {
  let s = 12345
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const blobs = Array.from({ length: 140 }, () => ({
    x: rand() * width * 1.4 - width * 0.2,
    y: rand() * height * 1.4 - height * 0.2,
    r2: (3 + rand() * 9) ** 2,
    amp: (rand() - 0.5) * 160,
  }))
  return (x, y) => {
    let v = 110 + 0.1 * x
    for (const b of blobs) {
      const dx = x - b.x, dy = y - b.y
      const d2 = dx * dx + dy * dy
      if (d2 < 9 * b.r2) v += b.amp * Math.exp(-d2 / b.r2)
    }
    return v
  }
}

/** Renders the scene as the camera sees it after the picture moved by
 * (dx, dy) and rolled by da about the centre: pixel p of the new frame shows
 * the scene point R(-da)(p - c - d) + c. */
export function render(width: number, height: number, dx = 0, dy = 0, da = 0): GreyImage {
  const f = scene(width, height)
  const data = new Float32Array(width * height)
  const cx = width / 2, cy = height / 2
  const c = Math.cos(-da), s = Math.sin(-da)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ux = x - cx - dx, uy = y - cy - dy
      data[y * width + x] = f(c * ux - s * uy + cx, s * ux + c * uy + cy)
    }
  }
  return { width, height, data }
}

describe('greyFromRgba', () => {
  it('weights the channels like OpenCV (BT.601)', () => {
    const g = greyFromRgba(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), 3, 1)
    expect(g.data[0]).toBeCloseTo(76.2, 0)
    expect(g.data[1]).toBeCloseTo(149.7, 0)
    expect(g.data[2]).toBeCloseTo(29.1, 0)
  })
})

describe('findCorners', () => {
  it('spreads corners over the picture rather than clustering them', () => {
    const pts = findCorners(render(320, 180))
    expect(pts.length).toBeGreaterThan(40)
    const left = pts.filter((p) => p.x < 160).length
    expect(left / pts.length).toBeGreaterThan(0.3)
    expect(left / pts.length).toBeLessThan(0.7)
  })

  it('finds nothing on a flat frame', () => {
    expect(findCorners({ width: 64, height: 48, data: new Float32Array(64 * 48).fill(90) })).toEqual([])
  })
})

describe('trackPoint', () => {
  // The corner nearest the centre: LK follows corners, not flat patches.
  const base = render(320, 180)
  const corner = findCorners(base).sort((p, q) =>
    Math.hypot(p.x - 160, p.y - 90) - Math.hypot(q.x - 160, q.y - 90))[0]

  it('follows a sub-pixel shift', () => {
    const a = buildPyramid(base, 3)
    const b = buildPyramid(render(320, 180, 2.4, -1.7), 3)
    const q = trackPoint(a, b, corner)
    expect(q).not.toBeNull()
    expect(q!.x - corner.x).toBeCloseTo(2.4, 1)
    expect(q!.y - corner.y).toBeCloseTo(-1.7, 1)
  })

  it('follows a shift larger than its window through the pyramid', () => {
    const a = buildPyramid(base, 3)
    const b = buildPyramid(render(320, 180, 14, 9), 3)
    const q = trackPoint(a, b, corner)
    expect(q!.x - corner.x).toBeCloseTo(14, 0)
    expect(q!.y - corner.y).toBeCloseTo(9, 0)
  })
})

describe('fitSimilarity', () => {
  it('recovers rotation and translation exactly from clean points', () => {
    const da = 0.02, tx = 3, ty = -2
    const p = [{ x: 10, y: 10 }, { x: 200, y: 30 }, { x: 50, y: 150 }, { x: 300, y: 170 }]
    const q = p.map(({ x, y }) => ({ x: Math.cos(da) * x - Math.sin(da) * y + tx, y: Math.sin(da) * x + Math.cos(da) * y + ty }))
    const m = fitSimilarity(p, q)!
    expect(Math.atan2(m.b, m.a)).toBeCloseTo(da, 6)
    expect(m.tx).toBeCloseTo(tx, 6)
    expect(m.ty).toBeCloseTo(ty, 6)
  })
})

describe('MotionEstimator', () => {
  it('reports no motion for the first frame', () => {
    expect(new MotionEstimator().step(render(320, 180))).toMatchObject({ dx: 0, dy: 0, da: 0 })
  })

  it('measures the shift of the picture centre and the roll', () => {
    const est = new MotionEstimator()
    est.step(render(320, 180))
    const m = est.step(render(320, 180, 3.2, -2.1, 0.012))
    expect(m.ok).toBe(true)
    expect(m.dx).toBeCloseTo(3.2, 0)
    expect(m.dy).toBeCloseTo(-2.1, 0)
    expect(m.da).toBeCloseTo(0.012, 2)
  })

  it('ignores something moving through the picture', () => {
    const est = new MotionEstimator()
    const a = render(320, 180)
    const b = render(320, 180, 2, 1)
    // A "person" walking across the right third: a patch that moved 12 px the other way.
    const person = render(320, 180, -10, 0)
    for (let y = 40; y < 140; y++) for (let x = 220; x < 290; x++) b.data[y * 320 + x] = person.data[y * 320 + x]
    est.step(a)
    const m = est.step(b)
    expect(m.dx).toBeCloseTo(2, 0)
    expect(m.dy).toBeCloseTo(1, 0)
  })

  it('reports a failure, not a guess, on a featureless frame', () => {
    const est = new MotionEstimator()
    const flat = { width: 320, height: 180, data: new Float32Array(320 * 180).fill(100) }
    est.step(flat)
    expect(est.step(flat)).toMatchObject({ ok: false, dx: 0, dy: 0, da: 0 })
    expect(est.failures).toBe(1)
  })
})

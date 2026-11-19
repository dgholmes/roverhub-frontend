import { describe, expect, it } from 'vitest'
import { color } from '@/design-system/tokens'
import type { PathSample, TakePaths } from '@/types/surveyReplay'
import { countUpTo, formatClock, toBuffers, verdictColour, viewBounds, type PathBuffer } from './replayModel'

/** The legs walking a `side` m square, one sample a second. */
function legsSquare(side: number): PathBuffer {
  const corners = [[0, 0], [side, 0], [side, side], [0, side], [0, 0]]
  const rows: number[][] = []
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < 10; i++) {
      const f = i / 10
      rows.push([corners[c][0] + (corners[c + 1][0] - corners[c][0]) * f, corners[c][1] + (corners[c + 1][1] - corners[c][1]) * f])
    }
  }
  return {
    t: Float64Array.from(rows.map((_, i) => i)),
    xyz: Float32Array.from(rows.flatMap(([x, y]) => [x, y, 0])),
  }
}

/** A take that follows the square, then runs away to `far` metres in x, y and z
 * over its last `count` samples (the 11-18 survey ended near z = -51 km). */
function runawayTake(far: number, count = 1): PathBuffer {
  const legs = legsSquare(10)
  const n = legs.t.length
  const xyz = Float32Array.from(legs.xyz)
  for (let i = n - count; i < n; i++) { xyz[i * 3] = far; xyz[i * 3 + 1] = far; xyz[i * 3 + 2] = far }
  return { t: legs.t, xyz }
}

const EMPTY: PathBuffer = { t: new Float64Array(0), xyz: new Float32Array(0) }

describe('viewBounds', () => {
  it('fits view to legs, not to a runaway take', () => {     // Review Focus 2
    const b = viewBounds(legsSquare(10), runawayTake(-51000))
    expect(b.maxX - b.minX).toBeLessThan(40); expect(Number.isFinite(b.minY)).toBe(true)
  })

  it('adds the margin around the legs', () => {
    expect(viewBounds(legsSquare(10), runawayTake(-51000), 10)).toEqual({ minX: -10, maxX: 20, minY: -10, maxY: 20 })
  })

  it('without legs, frames the take on its 5th-95th percentiles, never its extremes', () => {
    const b = viewBounds(EMPTY, runawayTake(-51000))
    expect(b.maxX - b.minX).toBeLessThan(40)
    expect(b.minY).toBeGreaterThan(-100)
  })

  it('is finite with nothing to frame, and skips non-finite samples', () => {
    for (const v of Object.values(viewBounds(EMPTY, EMPTY))) expect(Number.isFinite(v)).toBe(true)
    const legs = legsSquare(10)
    legs.xyz[3] = Number.NaN
    for (const v of Object.values(viewBounds(legs, EMPTY))) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('countUpTo', () => {
  it('countUpTo is a binary search', () => {
    const t = new Float64Array([0, 0.1, 0.2, 0.3]); expect(countUpTo(t, 0.15)).toBe(2); expect(countUpTo(t, 9)).toBe(4)
  })

  it('counts a sample at exactly the time, and none before the first', () => {
    const t = new Float64Array([925, 925.1, 925.2])
    expect(countUpTo(t, 925.1)).toBe(2)
    expect(countUpTo(t, 100)).toBe(0)
    expect(countUpTo(new Float64Array(0), 5)).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats survey clocks', () => { expect(formatClock(980)).toBe('16:20'); expect(formatClock(3725)).toBe('1:02:05') })

  it('floors a playhead between seconds and never goes negative', () => {
    expect(formatClock(980.9)).toBe('16:20')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('toBuffers', () => {
  it('splits a paths file into time and position arrays', () => {
    const row = (t: number, x: number): PathSample => [t, x, 2 * x, -x, 0]
    const paths: TakePaths = { take_id: 'original', take: [row(0, 1), row(0.1, 2)], legs: [row(0, 3)] }
    const b = toBuffers(paths)
    expect([...b.take.t]).toEqual([0, 0.1])
    expect([...b.take.xyz]).toEqual([1, 2, -1, 2, 4, -2])
    expect([...b.legs.xyz]).toEqual([3, 6, -3])
  })

  it('drops samples that are not finite, so nothing renders NaN', () => {
    const paths: TakePaths = { take_id: 'x', take: [[0, 1, 1, 0, 0], [0.1, Number.NaN, 1, 0, 0], [0.2, 2, 2, 0, 0]], legs: [] }
    const b = toBuffers(paths)
    expect([...b.take.t]).toEqual([0, 0.2])
    expect(b.legs.t.length).toBe(0)
  })
})

describe('verdictColour', () => {
  it('uses the status tokens', () => {
    expect(verdictColour('good')).toBe(color.green)
    expect(verdictColour('watch')).toBe(color.amber)
    expect(verdictColour('bad')).toBe(color.red)
    expect(verdictColour('standing')).toBe(color.t3)
    expect(verdictColour('no_data')).toBe(color.surface)
  })
})

import { describe, expect, it } from 'vitest'
import { GRID_FURNITURE, GRID_KNOWN, GRID_WALL, type SceneGrid } from '../types'
import { computeAlign, fitAlong, planDistanceFor } from './align'
import { cellAt, nearestCell, segmentBlocked, standableAt, toMapX, toMapY, toWorldX, toWorldZ, walkableAt } from './coords'
import { mergeRects } from './rects'
import { gridFrom } from './testGrid'

describe('coords', () => {
  it('maps map x,y to world X,Z with Z = -y, and back', () => {
    expect(toWorldX(3.5)).toBe(3.5)
    expect(toWorldZ(2)).toBe(-2)
    expect(toMapX(toWorldX(-7.25))).toBe(-7.25)
    expect(toMapY(toWorldZ(4.5))).toBe(4.5)
  })

  it('reads the cell under a map point, row 0 being the lowest y, and 0 outside', () => {
    const g = gridFrom(['W.', '.F'], 0.5, [10, 20])
    expect(cellAt(g, 10.1, 20.1) & 1).toBe(1)          // bottom-left '.'
    expect(cellAt(g, 10.6, 20.1) & GRID_FURNITURE).toBeTruthy()
    expect(cellAt(g, 10.1, 20.6) & GRID_WALL).toBeTruthy()
    expect(cellAt(g, 9.9, 20.1)).toBe(0)
    expect(cellAt(g, 11.01, 20.1)).toBe(0)
  })

  it('stands on walkable cells, or on known non-wall cells when there is no planning grid', () => {
    const g = gridFrom(['k.W'])
    expect(walkableAt(g, 1.5, 0.5)).toBe(true)
    expect(standableAt(g, 0.5, 0.5, true)).toBe(false)
    expect(standableAt(g, 0.5, 0.5, false)).toBe(true)
    expect(standableAt(g, 2.5, 0.5, false)).toBe(false)
  })

  it('flags a leg that leaves the walkable area, and none without a planning grid', () => {
    const g = gridFrom(['.....', '..W..', '.....'])
    expect(segmentBlocked(g, { x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 }, true)).toBe(false)
    expect(segmentBlocked(g, { x: 0.5, y: 1.5 }, { x: 4.5, y: 1.5 }, true)).toBe(true)
    expect(segmentBlocked(g, { x: 0.5, y: 1.5 }, { x: 4.5, y: 1.5 }, false)).toBe(false)
  })

  it('finds the nearest accepted cell centre', () => {
    const g = gridFrom(['WWWW', 'WWW.', 'WWWW'])
    expect(nearestCell(g, 0.5, 1.5, (x, y) => walkableAt(g, x, y))).toEqual({ x: 3.5, y: 1.5 })
    expect(nearestCell(gridFrom(['WW']), 0.5, 0.5, () => false, 5)).toBeNull()
  })
})

describe('mergeRects', () => {
  const covered = (g: SceneGrid, bit: number) => {
    const seen = new Uint8Array(g.w * g.h)
    for (const r of mergeRects(g, bit)) {
      for (let j = r.j0; j < r.j1; j++) for (let i = r.i0; i < r.i1; i++) seen[j * g.w + i]++
    }
    return seen
  }

  it('covers every set cell exactly once and nothing else', () => {
    const g = gridFrom(['WW..W', 'WW.WW', '..WWW', 'W.W.W'])
    const seen = covered(g, GRID_WALL)
    for (let k = 0; k < g.w * g.h; k++) expect(seen[k]).toBe(g.bits[k] & GRID_WALL ? 1 : 0)
  })

  it('stacks identical row runs into one rectangle', () => {
    const g = gridFrom(['.WW.', '.WW.', '.WW.'])
    expect(mergeRects(g, GRID_WALL)).toEqual([{ i0: 1, i1: 3, j0: 0, j1: 3 }])
  })

  it('returns nothing for a bit no cell has', () => {
    expect(mergeRects(gridFrom(['..', '..']), GRID_FURNITURE)).toEqual([])
  })
})

/** A square room of walls turned by `deg`, drawn into a 5 cm grid. */
function roomAt(deg: number): SceneGrid {
  const n = 240, res = 0.05
  const bits = new Uint8Array(n * n)
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i - n / 2) * res, y = (j - n / 2) * res
      const r = x * c + y * s, u = -x * s + y * c
      const inside = Math.abs(r) < 4 && Math.abs(u) < 3
      const wall = inside && (Math.abs(r) > 3.85 || Math.abs(u) > 2.85)
      bits[j * n + i] = wall ? GRID_WALL | GRID_KNOWN : inside ? GRID_KNOWN | 1 : 0
    }
  }
  return { w: n, h: n, res, origin: [-n / 2 * res, -n / 2 * res], bits, content: { minX: 0, minY: 0, maxX: n - 1, maxY: n - 1 } }
}

describe('computeAlign', () => {
  const deg = (yaw: number) => yaw * 180 / Math.PI

  it('finds the wall direction of a room surveyed at an angle', () => {
    expect(Math.abs(deg(computeAlign(roomAt(30)).yaw) - 30)).toBeLessThan(1)
    expect(Math.abs(deg(computeAlign(roomAt(0)).yaw))).toBeLessThan(0.5)
  })

  it('folds a direction past 45 degrees back into [-45, 45)', () => {
    expect(Math.abs(deg(computeAlign(roomAt(70)).yaw) + 20)).toBeLessThan(1)
  })

  it('measures the room along its own axes, centred where it is', () => {
    const a = computeAlign(roomAt(30))
    expect(a.cx).toBeCloseTo(0, 0)
    expect(a.cy).toBeCloseTo(0, 0)
    expect(Math.max(a.sr, a.su)).toBeCloseTo(8, 0)
    expect(Math.min(a.sr, a.su)).toBeCloseTo(6, 0)
  })

  it('answers yaw 0 for a grid with no walls, and frames the whole of an empty one', () => {
    expect(computeAlign(gridFrom(['...', '...'])).yaw).toBe(0)
    const empty = computeAlign(gridFrom(['   ', '   '], 1, [10, 0]))
    expect(empty).toMatchObject({ yaw: 0, cx: 11.5, cy: 1, sr: 3, su: 2 })
  })
})

describe('fitAlong and planDistanceFor', () => {
  const axes = { rx: 1, ry: 0, ux: 0, uy: 1 }

  it('centres on the points and pads their extent, never below the minimum span', () => {
    expect(fitAlong(axes, [])).toBeNull()
    const f = fitAlong(axes, [{ x: 0, y: 0 }, { x: 20, y: 4 }])!
    expect(f.cx).toBe(10)
    expect(f.cy).toBe(2)
    expect(f.sr).toBe(25)
    expect(f.su).toBe(6)
  })

  it('backs off far enough for the larger of height and width over aspect', () => {
    const tall = planDistanceFor(10, 20, 2)
    const wide = planDistanceFor(80, 20, 2)
    expect(wide / tall).toBeCloseTo(2, 5)
    // 20 m tall in a 30 degree view with the 8% margin.
    expect(tall).toBeCloseTo(20 / (2 * Math.tan(Math.PI / 12)) * 1.08, 5)
  })
})

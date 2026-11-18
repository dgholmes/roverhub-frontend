import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GridPixels } from '@/missions/floorCells'
import { buildSceneData, buildSceneGrid, classifyCloud, parseCloudBin } from './sceneData'
import {
  CLS_CEILING, CLS_FLOOR, CLS_FURNITURE, CLS_WALL,
  GRID_FURNITURE, GRID_KNOWN, GRID_WALKABLE, GRID_WALL,
} from './types'

/** A PGM-shaped grid: `rows[0]` is the TOP row, as the file stores it. */
const pgm = (rows: number[][]): GridPixels => ({
  width: rows[0].length, height: rows.length, pixels: new Uint8Array(rows.flat()),
})

afterEach(() => { vi.restoreAllMocks() })

describe('parseCloudBin', () => {
  it('reads little-endian x, y, z triples', () => {
    const view = new DataView(new ArrayBuffer(24))
    ;[1.5, -2, 3.25, 4, 5, 6].forEach((v, i) => view.setFloat32(i * 4, v, true))
    expect(Array.from(parseCloudBin(view.buffer)!)).toEqual([1.5, -2, 3.25, 4, 5, 6])
  })

  it('refuses a length that is not whole points', () => {
    expect(parseCloudBin(new ArrayBuffer(13))).toBeNull()
    expect(parseCloudBin(new ArrayBuffer(8))).toBeNull()
  })
})

describe('buildSceneGrid', () => {
  // Top row (max y) then bottom row (min y). Columns:
  //   structure: 0 wall | 254 free | 254 free | 205 unknown | 205 unknown
  //   planning:  0      | 254      | 0        | 254         | 205
  const structure = pgm([[0, 254, 254, 205, 205], [205, 205, 205, 205, 205]])
  const planning = pgm([[0, 254, 0, 254, 205], [205, 205, 205, 205, 205]])

  it('sets the bits as the options page did, with row 0 the lowest y', () => {
    const g = buildSceneGrid(structure, planning, 0.05, [1, 2])
    expect(g.w).toBe(5)
    expect(g.h).toBe(2)
    // Row 0 is the PGM's bottom row: all unknown.
    expect(Array.from(g.bits.subarray(0, 5))).toEqual([0, 0, 0, 0, 0])
    // Row 1 is the PGM's top row.
    expect(Array.from(g.bits.subarray(5))).toEqual([
      GRID_WALL | GRID_KNOWN, // structure wall; planning 0 there is not furniture
      GRID_WALKABLE | GRID_KNOWN,
      GRID_FURNITURE | GRID_KNOWN, // planning occupied where structure is free
      GRID_WALKABLE | GRID_KNOWN, // structure unknown, planning knows it
      0, // unknown to both
    ])
    expect(g.origin).toEqual([1, 2])
    expect(g.res).toBe(0.05)
  })

  it('frames the content without cropping the grid', () => {
    const g = buildSceneGrid(structure, planning, 0.05, [0, 0])
    expect(g.content).toEqual({ minX: 0, minY: 1, maxX: 3, maxY: 1 })
    expect(g.bits.length).toBe(10)
  })

  it('frames the whole grid when nothing is set', () => {
    const blank = pgm([[205, 205], [205, 205], [205, 205]])
    expect(buildSceneGrid(blank, null, 1, [0, 0]).content).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 2 })
  })

  it('with no planning grid, has walls and known cells only', () => {
    const g = buildSceneGrid(structure, null, 0.05, [0, 0])
    expect(Array.from(g.bits.subarray(5))).toEqual([GRID_WALL | GRID_KNOWN, GRID_KNOWN, GRID_KNOWN, 0, 0])
  })

  describe('a wall cleaned away in the planning grid', () => {
    // One row, each column a case: survey wall under planning free (erased in
    // Maps), occupied (kept), unknown (never planned); and planning occupied
    // where the survey never saw anything (the planning grid's own fill, which
    // stays furniture, never a wall).
    const survey = pgm([[0, 0, 0, 205]])
    const cleaned = pgm([[254, 0, 205, 0]])

    it('is drawn walkable, as the Maps editor draws it; anything else keeps the wall', () => {
      const g = buildSceneGrid(survey, cleaned, 0.05, [0, 0])
      expect(Array.from(g.bits)).toEqual([
        GRID_WALKABLE | GRID_KNOWN,
        GRID_WALL | GRID_KNOWN,
        GRID_WALL | GRID_KNOWN,
        GRID_FURNITURE | GRID_KNOWN,
      ])
    })

    it('comes back as a wall when the planning grid is restored, or there is none', () => {
      expect(buildSceneGrid(survey, pgm([[0, 0, 205, 0]]), 0.05, [0, 0]).bits[0]).toBe(GRID_WALL | GRID_KNOWN)
      expect(buildSceneGrid(survey, null, 0.05, [0, 0]).bits[0]).toBe(GRID_WALL | GRID_KNOWN)
    })

    it('is no longer a wall to the 3D scene either: a point on it below 0.9 m is furniture', () => {
      const g = buildSceneGrid(pgm([[0]]), pgm([[254]]), 1, [0, 0])
      const c = classifyCloud(new Float32Array([0.5, 0.5, 0.4]), g, 0)
      expect(c.cls[0]).toBe(CLS_FURNITURE)
      const kept = buildSceneGrid(pgm([[0]]), pgm([[0]]), 1, [0, 0])
      expect(classifyCloud(new Float32Array([0.5, 0.5, 0.4]), kept, 0).cls[0]).toBe(CLS_WALL)
    })
  })

  it('ignores, and warns about, a planning grid of another size', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = buildSceneGrid(structure, pgm([[254, 254]]), 0.05, [0, 0])
    expect(warn).toHaveBeenCalledOnce()
    expect(Array.from(g.bits.subarray(5))).toEqual([GRID_WALL | GRID_KNOWN, GRID_KNOWN, GRID_KNOWN, 0, 0])
  })
})

describe('classifyCloud', () => {
  // A 4 x 1 m grid at 1 m cells from (0, 0); cell (3, 0) is a wall.
  const structure = pgm([[254, 254, 254, 0]])
  const grid = buildSceneGrid(structure, null, 1, [0, 0])
  const floorZ = -0.5
  const classOf = (x: number, h: number) => {
    const c = classifyCloud(new Float32Array([x, 0.5, floorZ + h]), grid, floorZ)
    return c.count ? c.cls[0] : null
  }

  it('classifies by height above the floor at the boundaries', () => {
    expect(classOf(0.5, 0.079)).toBe(CLS_FLOOR)
    expect(classOf(0.5, 0.08)).toBe(CLS_FURNITURE)
    expect(classOf(0.5, 0.899)).toBe(CLS_FURNITURE)
    expect(classOf(0.5, 0.9)).toBe(CLS_WALL)
    expect(classOf(0.5, 2.85)).toBe(CLS_WALL)
    expect(classOf(0.5, 2.86)).toBe(CLS_CEILING)
    expect(classOf(0.5, -0.1)).toBe(CLS_FLOOR)
  })

  it('makes anything above the floor on a wall cell a wall', () => {
    expect(classOf(3.5, 0.079)).toBe(CLS_FLOOR)
    expect(classOf(3.5, 0.08)).toBe(CLS_WALL)
    expect(classOf(3.5, 3)).toBe(CLS_CEILING)
  })

  it('crops to the grid and to the height band', () => {
    expect(classOf(-0.01, 0.5)).toBeNull()
    expect(classOf(4, 0.5)).toBeNull() // the far edge is outside
    expect(classOf(0.5, -0.151)).toBeNull()
    expect(classOf(0.5, -0.149)).not.toBeNull()
    expect(classOf(0.5, 3.9)).toBeNull()
    expect(classOf(0.5, 3.89)).not.toBeNull()
    expect(classifyCloud(new Float32Array([0.5, 1.5, floorZ]), grid, floorZ).count).toBe(0)
    expect(classifyCloud(new Float32Array([Number.NaN, 0.5, floorZ]), grid, floorZ).count).toBe(0)
  })

  it('writes height above the floor, not map z', () => {
    const c = classifyCloud(new Float32Array([1.25, 0.75, 0.5]), grid, floorZ)
    expect(Array.from(c.xyh)).toEqual([1.25, 0.75, 1])
  })

  it('shuffles deterministically, keeping each point with its class', () => {
    const n = 200
    const xyz = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) { xyz[k * 3] = (k % 40) / 10; xyz[k * 3 + 1] = 0.5; xyz[k * 3 + 2] = floorZ + (k % 2 ? 1 : 0.01) }
    const a = classifyCloud(xyz, grid, floorZ)
    const b = classifyCloud(xyz, grid, floorZ)
    expect(Array.from(a.xyh)).toEqual(Array.from(b.xyh))
    expect(Array.from(a.cls)).toEqual(Array.from(b.cls))
    // Actually reordered, and differently for another seed.
    const xs = Array.from({ length: n }, (_, m) => a.xyh[m * 3])
    expect(xs).not.toEqual(Array.from({ length: n }, (_, k) => xyz[k * 3]))
    expect(Array.from(classifyCloud(xyz, grid, floorZ, { seed: 1 }).xyh)).not.toEqual(Array.from(a.xyh))
    // Nothing lost, and each class still matches its height.
    expect(a.count).toBe(n)
    for (let m = 0; m < n; m++) {
      const h = a.xyh[m * 3 + 2]
      expect(a.cls[m]).toBe(h > 0.5 ? CLS_WALL : CLS_FLOOR)
    }
  })
})

describe('buildSceneData', () => {
  const structure = pgm([[254, 0]])
  const base = { mapId: 'm', floorIndex: 2, floorZ: 0, res: 1, origin: [0, 0] as [number, number], structure }

  it('builds grid and cloud, and says whether planning was used', () => {
    const d = buildSceneData({ ...base, planning: pgm([[254, 0]]), cloud: new Float32Array([0.5, 0.5, 0.01]) })
    expect(d.mapId).toBe('m')
    expect(d.floorIndex).toBe(2)
    expect(d.hasPlanning).toBe(true)
    expect(d.cloud?.count).toBe(1)
  })

  it('has no cloud for a missing or empty one, and no planning for a misfit', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(buildSceneData({ ...base, planning: null, cloud: null }).cloud).toBeNull()
    expect(buildSceneData({ ...base, planning: null, cloud: new Float32Array(0) }).cloud).toBeNull()
    expect(buildSceneData({ ...base, planning: pgm([[254]]), cloud: null }).hasPlanning).toBe(false)
  })
})

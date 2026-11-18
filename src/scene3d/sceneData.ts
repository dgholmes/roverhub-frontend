import type { GridPixels } from '@/missions/floorCells'
import {
  CLS_CEILING, CLS_FLOOR, CLS_FURNITURE, CLS_WALL,
  GRID_FURNITURE, GRID_KNOWN, GRID_WALKABLE, GRID_WALL,
  type SceneCloud, type SceneData, type SceneGrid,
} from './types'

/**
 * The scene is built in the browser from the files every map already serves,
 * with the same rules the options page's offline builder used
 * (scratchpad map-options-build/build_data.py), so the console shows what was
 * approved there.
 */

/** PGM values the converter writes (tools/map_prep/pcd_to_floorgrid.py). */
const PGM_FREE = 254
const PGM_OCCUPIED = 0
const PGM_UNKNOWN = 205

/** One float32 x, y, z triple. */
const POINT_BYTES = 12

/** The height band kept, in metres relative to the floor: a little below it
 * (scan noise under the floor plane) up to above any ceiling we have seen. */
const CROP_BELOW_M = 0.15
const CROP_ABOVE_M = 3.9
/** Class boundaries, in metres above the floor. */
const FLOOR_BELOW_M = 0.08
const WALL_FROM_M = 0.9
const CEILING_ABOVE_M = 2.85

/** The options page shuffled with seed 7; keeping it makes a prefix the same
 * sample the page drew, for the same input. */
const DEFAULT_SEED = 7

/**
 * Decode `cloud`: little-endian float32 x, y, z triples and nothing else. Null
 * for a length that cannot be framed, rather than a cloud shifted by a byte.
 * Read through a DataView so the result does not depend on host endianness.
 */
export function parseCloudBin(buf: ArrayBuffer): Float32Array | null {
  if (buf.byteLength % POINT_BYTES !== 0) return null
  const view = new DataView(buf)
  const out = new Float32Array(buf.byteLength / 4)
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true)
  return out
}

/** Whether a planning grid can be laid over the structure grid cell for cell.
 * The backend stores them the same size; one that is not is not ours to guess
 * an alignment for. */
export function planningFits(structure: GridPixels, planning: GridPixels | null): boolean {
  return planning !== null && planning.width === structure.width && planning.height === structure.height
}

/**
 * The floor's cell bits (GRID_*), row 0 = lowest y: walls from the survey grid
 * except where the planning grid has cleaned them away (planning free),
 * walkable and furniture from the planning grid. Every view draws from this --
 * LiveOps' flat map and 3D scene, Missions, and Missions › Maps' editor -- so
 * they all show the same floor. Not cropped to the content:
 * cell (i, j) stays at `origin + (i, j) * res`, the same cell the flat map and
 * the waypoint checks use.
 *
 * A planning grid of another size is dropped with a warning, which leaves the
 * floor with no walkable or furniture bits -- never a misaligned guess at them.
 */
export function buildSceneGrid(
  structure: GridPixels, planning: GridPixels | null, res: number, origin: [number, number],
): SceneGrid {
  const w = structure.width, h = structure.height
  let plan: GridPixels | null = null
  if (planning) {
    if (planningFits(structure, planning)) plan = planning
    else console.warn(`planning grid is ${planning.width}x${planning.height} but the floor is ${w}x${h}; ignoring it`)
  }
  const bits = new Uint8Array(w * h)
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let j = 0; j < h; j++) {
    const src = (h - 1 - j) * w // PGM row 0 is the top
    for (let i = 0; i < w; i++) {
      const s = structure.pixels[src + i]
      const p = plan ? plan.pixels[src + i] : -1
      let v = 0
      if (p === PGM_FREE) v |= GRID_WALKABLE
      // A survey wall the planning grid calls free was cleaned away (Missions ›
      // Maps' Erase, or the planning build itself): drawn walkable, as the
      // editor draws it and as Nav2 plans on it. Only free clears a wall: a
      // planning cell left unknown keeps the survey's wall.
      if (s === PGM_OCCUPIED && p !== PGM_FREE) v |= GRID_WALL
      if (p === PGM_OCCUPIED && s !== PGM_OCCUPIED) v |= GRID_FURNITURE
      if (s !== PGM_UNKNOWN || (plan !== null && p !== PGM_UNKNOWN)) v |= GRID_KNOWN
      bits[j * w + i] = v
      if (v) {
        if (i < minX) minX = i
        if (i > maxX) maxX = i
        if (j < minY) minY = j
        if (j > maxY) maxY = j
      }
    }
  }
  const content = maxX < 0 ? { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 } : { minX, minY, maxX, maxY }
  return { w, h, res, origin: [origin[0], origin[1]], bits, content }
}

/** mulberry32: small, fast, and the same sequence everywhere for one seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Crop the cloud to the floor and classify each point. Classes are applied in
 * the builder's order, each overriding the last: furniture by default, floor
 * below 8 cm, wall from 0.9 m or on a wall cell above the floor, ceiling above
 * 2.85 m. The result is shuffled with a seeded PRNG so any prefix is a uniform
 * sample: the engine thins points by drawing fewer, not by re-sampling.
 *
 * The server's cloud is already sampled, so there is no voxel step here.
 * Non-finite values fall out of the crop (every comparison with NaN is false).
 */
export function classifyCloud(
  xyz: Float32Array, grid: SceneGrid, floorZ: number, opts: { seed?: number } = {},
): SceneCloud {
  const { w, h, res, origin, bits } = grid
  const [ox, oy] = origin
  const x1 = ox + w * res, y1 = oy + h * res
  const zLo = floorZ - CROP_BELOW_M, zHi = floorZ + CROP_ABOVE_M
  const n = Math.floor(xyz.length / 3)
  const keep = new Uint32Array(n)
  const clsAll = new Uint8Array(n)
  let count = 0
  for (let k = 0; k < n; k++) {
    const x = xyz[k * 3], y = xyz[k * 3 + 1], z = xyz[k * 3 + 2]
    if (!(x >= ox && x < x1 && y >= oy && y < y1 && z > zLo && z < zHi)) continue
    const hz = z - floorZ
    // Clamped like the builder: float rounding at the far edge must not index out.
    const i = Math.min(w - 1, Math.max(0, Math.floor((x - ox) / res)))
    const j = Math.min(h - 1, Math.max(0, Math.floor((y - oy) / res)))
    const wallCell = (bits[j * w + i] & GRID_WALL) !== 0
    let c = CLS_FURNITURE
    if (hz < FLOOR_BELOW_M) c = CLS_FLOOR
    if (hz >= WALL_FROM_M || (wallCell && hz >= FLOOR_BELOW_M)) c = CLS_WALL
    if (hz > CEILING_ABOVE_M) c = CLS_CEILING
    keep[count] = k
    clsAll[k] = c
    count++
  }
  // Fisher-Yates over the kept indices.
  const order = keep.subarray(0, count)
  const rand = mulberry32(opts.seed ?? DEFAULT_SEED)
  for (let a = count - 1; a > 0; a--) {
    const b = Math.floor(rand() * (a + 1))
    const t = order[a]; order[a] = order[b]; order[b] = t
  }
  const xyh = new Float32Array(count * 3)
  const cls = new Uint8Array(count)
  for (let m = 0; m < count; m++) {
    const k = order[m]
    xyh[m * 3] = xyz[k * 3]
    xyh[m * 3 + 1] = xyz[k * 3 + 1]
    xyh[m * 3 + 2] = xyz[k * 3 + 2] - floorZ
    cls[m] = clsAll[k]
  }
  return { count, xyh, cls }
}

/**
 * One floor's scene. A missing or empty cloud gives `cloud: null` (Plan only);
 * `hasPlanning` is false when there was no planning grid or it did not fit.
 */
export function buildSceneData(args: {
  mapId: string
  floorIndex: number
  floorZ: number
  res: number
  origin: [number, number]
  structure: GridPixels
  planning: GridPixels | null
  cloud: Float32Array | null
}): SceneData {
  const grid = buildSceneGrid(args.structure, args.planning, args.res, args.origin)
  const cloud = args.cloud && args.cloud.length >= 3 ? classifyCloud(args.cloud, grid, args.floorZ) : null
  return {
    mapId: args.mapId,
    floorIndex: args.floorIndex,
    floorZ: args.floorZ,
    grid,
    cloud,
    hasPlanning: planningFits(args.structure, args.planning),
  }
}

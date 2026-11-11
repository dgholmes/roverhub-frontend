import type { GridPixels } from '@/missions/floorCells'
import type { MapFloor, Point2D } from '@/types/maps'

/**
 * Where the robot may walk, from a floor's PLANNING grid (schema 0.0.17,
 * `MapFloor.planning`) -- the grid Nav2 plans on, not the survey's wall slice.
 *
 * On 2026-11-11 every refused goal looked fine on the map, because the map drew
 * the survey grid ("2% surveyed") while Nav2 planned on this one. So the console
 * now reads this grid the way Nav2 does, and says three things about a cell:
 * - WALKABLE: free, and at least `clearance_m` from every cell that is not
 *   free, so the robot's centre fits there;
 * - TIGHT: free, but closer than that to something;
 * - blocked: not free (occupied or unknown -- the survey never walked it).
 * Walkable cells are then grouped into 8-connected regions, so a tap can be
 * refused when it is walkable but in a region the robot is not in.
 *
 * Pure and synchronous. It runs once per grid, off the render path (see
 * useWalkableArea), never per frame.
 */

/** Nav2's map_server thresholds for a trinary map with negate 0: a pixel `v`
 * has occupancy (255 - v) / 255. */
export const PLANNING_OCCUPIED_THRESH = 0.65
export const PLANNING_FREE_THRESH = 0.196

export type PlanningCell = 'free' | 'occupied' | 'unknown'

/** How Nav2 reads one planning-grid pixel. */
export function planningCellClass(value: number): PlanningCell {
  const occupancy = (255 - value) / 255
  if (occupancy > PLANNING_OCCUPIED_THRESH) return 'occupied'
  if (occupancy < PLANNING_FREE_THRESH) return 'free'
  return 'unknown'
}

/** Mask values, one byte per cell. */
export const CELL_BLOCKED = 0
export const CELL_TIGHT = 1
export const CELL_WALKABLE = 2

export interface WalkableAnalysis {
  width: number
  height: number
  resolution_m: number
  clearance_m: number
  /** Row-major, row 0 at the TOP of the floor (max y), as the PGM. One of the
   * CELL_* values per cell. */
  mask: Uint8Array
  /** The 8-connected walkable region of each cell, numbered from 1; 0 for a
   * cell that is not walkable. */
  region: Int32Array
  regionCount: number
  walkableCells: number
  tightCells: number
}

const INF = 1e20

/**
 * One-dimensional squared Euclidean distance transform (Felzenszwalb and
 * Huttenlocher, 2012) of `f` into `d`, `n` samples. `v`/`z` are scratch.
 */
function edt1d(f: Float64Array, d: Float64Array, n: number, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    if (f[q] >= INF) continue
    // Skip leading INF samples: a parabola rooted at infinity is no parabola.
    if (f[v[k]] >= INF) { v[k] = q; z[k] = -INF; z[k + 1] = INF; continue }
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  if (f[v[0]] >= INF) { for (let q = 0; q < n; q++) d[q] = INF; return }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/**
 * Squared distance, in cells between cell centres, from each cell of a
 * `width` x `height` grid to the nearest cell where `blocked` is true. Beyond
 * the grid's edge counts as blocked: the robot cannot stand off the map.
 * Exported for tests.
 */
export function squaredDistanceToBlocked(blocked: (i: number) => boolean, width: number, height: number): Float64Array {
  // Pad by one blocked cell all round, so the edge is an obstacle.
  const pw = width + 2, ph = height + 2
  const g = new Float64Array(pw * ph)
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const x = px - 1, y = py - 1
      const edge = x < 0 || y < 0 || x >= width || y >= height
      g[py * pw + px] = edge || blocked(y * width + x) ? 0 : INF
    }
  }
  const n = Math.max(pw, ph)
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1)
  const v = new Int32Array(n)
  // Columns, then rows.
  for (let px = 0; px < pw; px++) {
    for (let py = 0; py < ph; py++) f[py] = g[py * pw + px]
    edt1d(f, d, ph, v, z)
    for (let py = 0; py < ph; py++) g[py * pw + px] = d[py]
  }
  const out = new Float64Array(width * height)
  for (let py = 1; py < ph - 1; py++) {
    for (let px = 0; px < pw; px++) f[px] = g[py * pw + px]
    edt1d(f, d, pw, v, z)
    for (let x = 0; x < width; x++) out[(py - 1) * width + x] = d[x + 1]
  }
  return out
}

/**
 * The walkable mask and its regions for a planning grid. `clearance_m` is the
 * planning grid's own (`PlanningGrid.clearance_m`); a cell exactly that far
 * from the nearest blocked cell is walkable ("at least").
 */
export function analyseWalkable(grid: GridPixels, resolution_m: number, clearance_m: number): WalkableAnalysis {
  const { width, height, pixels } = grid
  const total = width * height
  const free = new Uint8Array(total)
  for (let i = 0; i < total; i++) free[i] = planningCellClass(pixels[i]) === 'free' ? 1 : 0

  const d2 = squaredDistanceToBlocked((i) => free[i] === 0, width, height)
  // Compared in cells, with a hair of slack: 0.2 / 0.05 is 4.000000000000001
  // in floating point, which would make a cell exactly 4 away read as tight.
  const r = clearance_m / resolution_m
  const minD2 = r * r - 1e-6
  const mask = new Uint8Array(total)
  let walkableCells = 0, tightCells = 0
  for (let i = 0; i < total; i++) {
    if (!free[i]) continue
    if (d2[i] >= minD2) { mask[i] = CELL_WALKABLE; walkableCells++ } else { mask[i] = CELL_TIGHT; tightCells++ }
  }

  const { region, regionCount } = labelRegions(mask, width, height)
  return { width, height, resolution_m, clearance_m, mask, region, regionCount, walkableCells, tightCells }
}

/**
 * 8-connected regions of walkable cells. Diagonal steps count: the planner
 * takes them, and a region split only at a diagonal would refuse a goal the
 * robot can reach -- a worse mistake here than letting Nav2 refuse one.
 */
export function labelRegions(mask: Uint8Array, width: number, height: number): { region: Int32Array; regionCount: number } {
  const region = new Int32Array(width * height)
  const queue = new Int32Array(width * height)
  let regionCount = 0
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== CELL_WALKABLE || region[start] !== 0) continue
    const id = ++regionCount
    let head = 0, tail = 0
    queue[tail++] = start
    region[start] = id
    while (head < tail) {
      const i = queue[head++]
      const x = i % width, y = (i - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue
          const j = ny * width + nx
          if (mask[j] === CELL_WALKABLE && region[j] === 0) { region[j] = id; queue[tail++] = j }
        }
      }
    }
  }
  return { region, regionCount }
}

/** Walkable floor area in square metres. */
export function walkableAreaM2(analysis: Pick<WalkableAnalysis, 'walkableCells' | 'resolution_m'>): number {
  return analysis.walkableCells * analysis.resolution_m * analysis.resolution_m
}

type FloorOrigin = Pick<MapFloor, 'origin_xy_m' | 'resolution_m'>

/** The index of the cell under a map-frame point, or -1 off the grid. Rows
 * count up from the floor's origin while the mask runs down from the top. */
export function cellIndexAt(analysis: Pick<WalkableAnalysis, 'width' | 'height'>, floor: FloorOrigin, point: Point2D): number {
  const col = Math.floor((point[0] - floor.origin_xy_m[0]) / floor.resolution_m)
  const rowFromBottom = Math.floor((point[1] - floor.origin_xy_m[1]) / floor.resolution_m)
  if (col < 0 || col >= analysis.width || rowFromBottom < 0 || rowFromBottom >= analysis.height) return -1
  return (analysis.height - 1 - rowFromBottom) * analysis.width + col
}

/** How far around the robot to look for walkable ground when the cell it
 * stands on is not walkable itself (beside a wall, or a few cm of drift). */
export const ROBOT_REGION_SEARCH_M = 0.5

/**
 * The walkable regions the robot can start from: the region of its own cell,
 * or, when that cell is not walkable, every region within
 * ROBOT_REGION_SEARCH_M of it. Null when there is none (or the robot is off the
 * grid): reachability is then unknown, and nothing is refused on it.
 */
export function robotRegions(analysis: WalkableAnalysis, floor: FloorOrigin, at: Point2D): ReadonlySet<number> | null {
  return regionsAroundCell(analysis, cellIndexAt(analysis, floor, at))
}

/** `robotRegions` by cell index (-1 off the grid), so a caller can memoize on
 * the cell rather than on every centimetre the position moves. */
export function regionsAroundCell(analysis: WalkableAnalysis, i: number): ReadonlySet<number> | null {
  if (i < 0 || i >= analysis.mask.length) return null
  if (analysis.region[i] > 0) return new Set([analysis.region[i]])
  const { width, height } = analysis
  const x0 = i % width, y0 = (i - x0) / width
  const r = Math.ceil(ROBOT_REGION_SEARCH_M / analysis.resolution_m)
  const found = new Set<number>()
  for (let dy = -r; dy <= r; dy++) {
    const y = y0 + dy
    if (y < 0 || y >= height) continue
    for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx
      if (x < 0 || x >= width || dx * dx + dy * dy > r * r) continue
      const id = analysis.region[y * width + x]
      if (id > 0) found.add(id)
    }
  }
  return found.size > 0 ? found : null
}

export type WalkableRefusalReason = 'notWalkable' | 'tooTight' | 'unreachable'

/**
 * Why a goal at `point` cannot be planned to, or null when it can:
 * - `notWalkable`: the planning grid does not mark it free -- never walked in
 *   the survey (or off the grid);
 * - `tooTight`: free, but too close to an obstacle for the robot to fit;
 * - `unreachable`: walkable, but in a region the robot is not in. Only said
 *   when the robot's regions are known (`from` not null).
 */
export function walkableRefusal(
  analysis: WalkableAnalysis, floor: FloorOrigin, point: Point2D, from: ReadonlySet<number> | null,
): WalkableRefusalReason | null {
  const i = cellIndexAt(analysis, floor, point)
  if (i < 0 || analysis.mask[i] === CELL_BLOCKED) return 'notWalkable'
  if (analysis.mask[i] === CELL_TIGHT) return 'tooTight'
  if (from && !from.has(analysis.region[i])) return 'unreachable'
  return null
}

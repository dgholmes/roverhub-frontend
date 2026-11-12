import { GRID_KNOWN, GRID_WALKABLE, GRID_WALL, type SceneGrid } from '../types'

/**
 * Map frame (x east, y north, metres) <-> world (X right, Y up from the floor,
 * Z toward the viewer). As the options page: X = x, Z = -y. There is no offset
 * here (the page subtracted the cloud's centre); map coordinates on a site are
 * tens of metres, well inside float32.
 */
export const toWorldX = (x: number): number => x
export const toWorldZ = (y: number): number => -y
export const toMapX = (X: number): number => X
export const toMapY = (Z: number): number => -Z

/** The bits of the cell holding map point (x, y); 0 outside the grid. */
export function cellAt(grid: SceneGrid, x: number, y: number): number {
  const i = Math.floor((x - grid.origin[0]) / grid.res)
  const j = Math.floor((y - grid.origin[1]) / grid.res)
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return 0
  return grid.bits[j * grid.w + i]
}

/** Whether the planning grid says (x, y) is walkable. */
export function walkableAt(grid: SceneGrid, x: number, y: number): boolean {
  return (cellAt(grid, x, y) & GRID_WALKABLE) !== 0
}

/**
 * Where the stand-in may stand. With a planning grid, its walkable cells (as
 * the options page). Without one there are no walkable bits at all, so any
 * known cell that is not a wall stands in for them; otherwise the stand-in
 * could not move on such a map.
 */
export function standableAt(grid: SceneGrid, x: number, y: number, hasPlanning: boolean): boolean {
  const b = cellAt(grid, x, y)
  if (hasPlanning) return (b & GRID_WALKABLE) !== 0
  return (b & GRID_KNOWN) !== 0 && (b & GRID_WALL) === 0
}

/**
 * Whether the straight leg a -> b leaves the walkable area, sampled every
 * 5 cm as the options page does. Always false without a planning grid: there
 * is no walkable area to leave, and flagging every leg would say nothing.
 */
export function segmentBlocked(
  grid: SceneGrid, a: { x: number; y: number }, b: { x: number; y: number }, hasPlanning: boolean,
): boolean {
  if (!hasPlanning) return false
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(1, Math.ceil(len / 0.05))
  for (let k = 0; k <= n; k++) {
    const t = k / n
    if (!walkableAt(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true
  }
  return false
}

/**
 * The cell centre nearest (x, y) that `ok` accepts, searching outward ring by
 * ring up to `maxCells`; null when there is none. For placing the stand-in on
 * a map with no route to start from.
 */
export function nearestCell(
  grid: SceneGrid, x: number, y: number, ok: (x: number, y: number) => boolean, maxCells = 400,
): { x: number; y: number } | null {
  const { res, origin } = grid
  const ci = Math.floor((x - origin[0]) / res)
  const cj = Math.floor((y - origin[1]) / res)
  const centre = (i: number, j: number) => ({ x: origin[0] + (i + 0.5) * res, y: origin[1] + (j + 0.5) * res })
  for (let r = 0; r <= maxCells; r++) {
    let best: { x: number; y: number } | null = null
    let bestD = Infinity
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        const i = ci + di, j = cj + dj
        if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) continue
        const p = centre(i, j)
        if (!ok(p.x, p.y)) continue
        const d = (p.x - x) ** 2 + (p.y - y) ** 2
        if (d < bestD) { bestD = d; best = p }
      }
    }
    if (best) return best
  }
  return null
}

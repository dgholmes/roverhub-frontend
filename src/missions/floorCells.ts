import type { MissionWaypoint } from '@/types'
import type { MapFloor, Point2D, SiteMap } from '@/types/maps'

/** What a point on a surveyed floor is: ground the lidar saw as open, a thing
 * it hit, or ground it never classified. `unknown` is not free. */
export type CellClass = 'free' | 'occupied' | 'unknown'

/** A decoded occupancy grid. `pixels` is row-major with row 0 at the TOP of the
 * floor (max y), as Nav2 writes a map. */
export interface GridPixels {
  width: number
  height: number
  pixels: Uint8Array
}

/** The two values the converter writes besides 205 for unknown
 * (tools/map_prep/pcd_to_floorgrid.py). Anything else is read as unknown. */
const PGM_FREE = 254
const PGM_OCCUPIED = 0

const isSpace = (b: number) => b === 0x20 || (b >= 0x09 && b <= 0x0d)

/**
 * Decode a binary PGM (P5, one byte per pixel) -- the file the backend serves
 * as a floor's `grid`. A browser cannot draw a PGM, so this reads the bytes
 * directly, and refuses what it is unsure of: a wrong header, a body of the
 * wrong length, or 16-bit samples all give null, because guessing at a grid
 * would let a waypoint be reported as standing on free floor.
 */
export function parsePgm(bytes: Uint8Array): GridPixels | null {
  let i = 0
  // One header token, skipping whitespace and `#` comments before it. Stops on
  // the single whitespace byte after it, which is also what separates the
  // header from the pixels, so a pixel that looks like whitespace is safe.
  const token = (): string | null => {
    for (;;) {
      while (i < bytes.length && isSpace(bytes[i])) i++
      if (bytes[i] !== 0x23) break
      while (i < bytes.length && bytes[i] !== 0x0a) i++
    }
    const start = i
    while (i < bytes.length && !isSpace(bytes[i]) && bytes[i] !== 0x23) i++
    return i > start ? String.fromCharCode(...bytes.subarray(start, i)) : null
  }
  if (token() !== 'P5') return null
  const width = Number(token()), height = Number(token()), maxval = Number(token())
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null
  if (maxval < 1 || maxval > 255) return null
  i++ // the one whitespace byte that ends the header
  const body = bytes.subarray(i)
  if (body.length !== width * height) return null
  return { width, height, pixels: body }
}

/**
 * The class of the cell under `point` (map-frame metres, `[x, y]`). Outside the
 * grid is `unknown`: the survey said nothing about it.
 *
 * The floor's origin is the lower-left corner, so rows count up from the bottom
 * while the pixels run down from the top.
 */
export function cellAt(
  floor: Pick<MapFloor, 'origin_xy_m' | 'resolution_m'>, grid: GridPixels, point: Point2D,
): CellClass {
  const col = Math.floor((point[0] - floor.origin_xy_m[0]) / floor.resolution_m)
  const rowFromBottom = Math.floor((point[1] - floor.origin_xy_m[1]) / floor.resolution_m)
  if (col < 0 || col >= grid.width || rowFromBottom < 0 || rowFromBottom >= grid.height) return 'unknown'
  const value = grid.pixels[(grid.height - 1 - rowFromBottom) * grid.width + col]
  return value === PGM_FREE ? 'free' : value === PGM_OCCUPIED ? 'occupied' : 'unknown'
}

/** Whether two floor elevations are the same floor. The elevation is copied
 * verbatim from the map, so this only tolerates a JSON round trip. */
const sameElevation = (a: number, b: number) => Math.abs(a - b) < 1e-6

/**
 * The floor a waypoint is on. A waypoint carries its floor's elevation in
 * `z_m` (the wire has no floor index); one with none, or with an elevation no
 * floor has, is taken to be on the floor the operator is looking at.
 */
export function floorOfWaypoint(map: SiteMap, waypoint: MissionWaypoint, activeIndex: number): MapFloor | undefined {
  const byElevation = waypoint.z_m === null
    ? undefined
    : map.floors.find((f) => sameElevation(f.floor_z_m, waypoint.z_m as number))
  return byElevation ?? map.floors.find((f) => f.index === activeIndex)
}

/** Each waypoint's cell class, against its own floor's grid. A waypoint whose
 * grid is not loaded is left out: unclassified, which is not the same as free. */
export function waypointCells(
  map: SiteMap, grids: Readonly<Record<number, GridPixels>>, waypoints: readonly MissionWaypoint[], activeIndex: number,
): Record<string, CellClass> {
  const out: Record<string, CellClass> = {}
  for (const wp of waypoints) {
    const floor = floorOfWaypoint(map, wp, activeIndex)
    const grid = floor && grids[floor.index]
    if (floor && grid) out[wp.waypoint_id] = cellAt(floor, grid, [wp.x_m, wp.y_m])
  }
  return out
}

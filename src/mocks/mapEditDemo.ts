import type { MovedBlob, MovedLayer } from '@/types/mapPipeline'
import type { MapFloor } from '@/types/maps'

/**
 * A made-up floor for the map editor in demo mode: an office hall with desk
 * blocks, a door, pillars, and six people the survey caught walking past. The
 * sample maps have no stored files, so the editor's floor is drawn from this,
 * fitted to whatever floor it is asked for (its origin, size and resolution).
 *
 * The survey grid is the wall slice: walls, pillars and the people (standing,
 * they reach it), but not the desks, which are below it. The planning grid is
 * what planning_grid.py would build: all of those plus the desks. The people
 * are also in the cloud, and listed in `moved.json` with their points in
 * `moved_cloud` -- what tools/map_prep/transient_filter.py would write.
 */

export const PGM_FREE = 254
export const PGM_OCCUPIED = 0
export const PGM_UNKNOWN = 205

export interface DemoFloorFiles {
  /** The survey grid, PGM pixels (row 0 at the top). */
  grid: Uint8Array
  /** The planning grid, the same size. */
  planning: Uint8Array
  /** Map-frame x, y, z triples. */
  cloud: Float32Array
  moved: MovedLayer
  movedCloud: Float32Array
}

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rect = [number, number, number, number]

/** People caught by the survey, as fractions across the room, radius in metres,
 *  and how many scans saw through them. Biggest first once sorted. */
const PEOPLE: [number, number, number, number, number, string][] = [
  [0.48, 0.47, 0.32, 41, 37, 'b001'],
  [0.80, 0.30, 0.26, 12, 22, 'b002'],
  [0.22, 0.70, 0.22, 7, 15, 'b003'],
  [0.62, 0.82, 0.19, 18, 11, 'b004'],
  [0.35, 0.18, 0.16, 9, 8, 'b005'],
  [0.88, 0.64, 0.12, 5, 6, 'b006'],
]

export function demoFloorFiles(floor: Pick<MapFloor, 'size_cells' | 'resolution_m' | 'origin_xy_m' | 'floor_z_m'>): DemoFloorFiles {
  const [w, h] = floor.size_cells
  const res = floor.resolution_m
  const [ox, oy] = floor.origin_xy_m
  const fz = floor.floor_z_m
  const rand = rng(11)
  // The room: inset from the grid's edge, as a survey's grid is padded.
  const inset = Math.min(1.5, (w * res) / 8)
  const room: Rect = [ox + inset, oy + inset, ox + w * res - inset, oy + h * res - inset]
  const rw = room[2] - room[0], rh = room[3] - room[1]
  const at = (fx: number, fy: number): [number, number] => [room[0] + fx * rw, room[1] + fy * rh]
  const wallT = 0.15
  const desks: Rect[] = []
  for (const fy of [0.25, 0.55]) {
    for (const fx of [0.12, 0.55]) {
      const [x, y] = at(fx, fy)
      desks.push([x, y, x + rw * 0.3, y + Math.min(1.4, rh * 0.08)])
    }
  }
  const pillars: Rect[] = [at(0.33, 0.85), at(0.75, 0.12)].map(([x, y]) => [x, y, x + 0.4, y + 0.4])
  const door: [number, number] = [room[1] + rh * 0.4, room[1] + rh * 0.4 + 1.2] // a gap in the east wall
  const people = PEOPLE.map(([fx, fy, r, pass, hits, id]) => ({ c: at(fx, fy), r, pass, hits, id }))

  const inside = (x: number, y: number, r: Rect) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]
  const isWall = (x: number, y: number) => {
    if (!inside(x, y, [room[0] - wallT, room[1] - wallT, room[2] + wallT, room[3] + wallT])) return false
    if (inside(x, y, room)) return false
    if (x > room[2] && y >= door[0] && y <= door[1]) return false
    return true
  }

  const grid = new Uint8Array(w * h)
  const planning = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + (i + 0.5) * res, y = oy + (j + 0.5) * res
      const k = (h - 1 - j) * w + i
      let g = PGM_UNKNOWN, p = PGM_UNKNOWN
      if (isWall(x, y) || pillars.some((r) => inside(x, y, r))) { g = PGM_OCCUPIED; p = PGM_OCCUPIED }
      else if (inside(x, y, room) || (x > room[2] && x < room[2] + 1.5 && y >= door[0] && y <= door[1])) {
        g = PGM_FREE; p = PGM_FREE
        if (desks.some((r) => inside(x, y, r))) p = PGM_OCCUPIED
        if (people.some((q) => (x - q.c[0]) ** 2 + (y - q.c[1]) ** 2 <= q.r * q.r)) { g = PGM_OCCUPIED; p = PGM_OCCUPIED }
      }
      grid[k] = g
      planning[k] = p
    }
  }

  const pts: number[] = []
  const push = (x: number, y: number, z: number) => pts.push(x, y, fz + z)
  // Floor, sparse.
  for (let n = 0; n < 9000; n++) push(room[0] + rand() * rw, room[1] + rand() * rh, (rand() - 0.5) * 0.03)
  // Walls, up to 2.6 m, minus the door.
  const perimeter = 2 * (rw + rh)
  for (let n = 0; n < 26000; n++) {
    let s = rand() * perimeter, x: number, y: number
    if (s < rw) { x = room[0] + s; y = room[1] }
    else if ((s -= rw) < rh) { x = room[2]; y = room[1] + s; if (y >= door[0] && y <= door[1]) continue }
    else if ((s -= rh) < rw) { x = room[2] - s; y = room[3] }
    else { s -= rw; x = room[0]; y = room[3] - s }
    push(x + (rand() - 0.5) * 0.04, y + (rand() - 0.5) * 0.04, rand() * 2.6)
  }
  // Desks: a top at 0.75 m and a modesty panel.
  for (const d of desks) {
    for (let n = 0; n < 1600; n++) push(d[0] + rand() * (d[2] - d[0]), d[1] + rand() * (d[3] - d[1]), 0.73 + rand() * 0.04)
    for (let n = 0; n < 500; n++) push(d[0] + rand() * (d[2] - d[0]), (d[1] + d[3]) / 2, rand() * 0.75)
  }
  for (const p of pillars) {
    for (let n = 0; n < 800; n++) {
      const a = rand() * 4, z = rand() * 2.6
      const x = a < 1 ? p[0] + a * 0.4 : a < 2 ? p[2] : a < 3 ? p[2] - (a - 2) * 0.4 : p[0]
      const y = a < 1 ? p[1] : a < 2 ? p[1] + (a - 1) * 0.4 : a < 3 ? p[3] : p[3] - (a - 3) * 0.4
      push(x, y, z)
    }
  }
  const movedPts: number[] = []
  const blobs: MovedBlob[] = []
  for (const q of people) {
    const n0 = pts.length
    const count = Math.round(4000 * q.r * q.r) + 60
    const height = 1.2 + q.r * 1.6
    for (let n = 0; n < count; n++) {
      const a = rand() * Math.PI * 2, rr = q.r * Math.sqrt(rand())
      push(q.c[0] + Math.cos(a) * rr, q.c[1] + Math.sin(a) * rr, 0.05 + rand() * height)
    }
    for (let k = n0; k < pts.length; k++) movedPts.push(pts[k])
    const polygon: [number, number][] = []
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2
      polygon.push([round(q.c[0] + Math.cos(a) * q.r), round(q.c[1] + Math.sin(a) * q.r)])
    }
    blobs.push({
      id: q.id, centroid: [round(q.c[0]), round(q.c[1])],
      bbox: [round(q.c[0] - q.r), round(q.c[1] - q.r), round(q.c[0] + q.r), round(q.c[1] + q.r)],
      z_range: [round(fz + 0.02), round(fz + 0.05 + height)],
      area_m2: round(Math.PI * q.r * q.r), points: count, hits: q.hits, pass_through: q.pass, polygon,
    })
  }
  blobs.sort((a, b) => b.area_m2 - a.area_m2)
  return {
    grid, planning, cloud: Float32Array.from(pts),
    moved: { version: 1, source: 'transient_filter 0.1 (demo)', params: { voxel_m: 0.1, min_pass_through: 5 }, blobs },
    movedCloud: Float32Array.from(movedPts),
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000

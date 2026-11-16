/**
 * Box selection in the map scene: a rectangle dragged on the floor plane plus a
 * height band makes an axis-aligned box, and the points inside it are what a
 * cloud edit deletes. Pure maths, no three.js, so it is tested directly and the
 * engine only draws what it is handed.
 *
 * The scene works in heights above the floor (`SceneCloud.xyh`); the backend's
 * cloud edits are in map z. `toMapBox` / `fromMapBox` convert, given the
 * floor's `floor_z_m`.
 */
import type { CloudEditBox } from '@/types/mapPipeline'

/** A rectangle on the floor, map metres, min <= max. */
export interface FloorRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A box in the scene's terms: map x, y and height above the floor. */
export interface SceneBox {
  min: [number, number, number]
  max: [number, number, number]
}

/** How a box is drawn: being dragged, staged for deletion, or a moved blob
 *  staged for removal. */
export type SceneBoxTone = 'draft' | 'staged' | 'moved'

export interface SceneEditBox extends SceneBox {
  id: string
  tone: SceneBoxTone
}

/** The height band a new box takes, metres above the floor. From just under
 *  the floor (scan noise) to above a standing person. */
export const DEFAULT_BAND: Readonly<[number, number]> = [-0.1, 2.2]
/** Heights a band may span: the cloud the scene keeps (sceneData CROP_*). */
export const BAND_LIMITS: Readonly<[number, number]> = [-0.15, 3.9]
/** A drag shorter than this on either side is a click, not a box. */
export const MIN_RECT_M = 0.05

export function rectFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): FloorRect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
}

/** Whether a dragged rectangle is a box rather than a click. */
export function rectUsable(rect: FloorRect, min = MIN_RECT_M): boolean {
  return rect.x1 - rect.x0 >= min && rect.y1 - rect.y0 >= min
}

/** A band put in order and inside BAND_LIMITS; a band with no height gets 1 cm. */
export function clampBand(lo: number, hi: number): [number, number] {
  const [minH, maxH] = BAND_LIMITS
  let a = Number.isFinite(lo) ? lo : DEFAULT_BAND[0]
  let b = Number.isFinite(hi) ? hi : DEFAULT_BAND[1]
  if (a > b) [a, b] = [b, a]
  a = Math.min(Math.max(a, minH), maxH)
  b = Math.min(Math.max(b, minH), maxH)
  if (b - a < 0.01) {
    if (b + 0.01 <= maxH) b = a + 0.01
    else a = b - 0.01
  }
  return [a, b]
}

export function boxFromRect(rect: FloorRect, band: readonly [number, number]): SceneBox {
  const [lo, hi] = clampBand(band[0], band[1])
  return { min: [rect.x0, rect.y0, lo], max: [rect.x1, rect.y1, hi] }
}

/** Scene box (heights) to the backend's map-frame box. */
export function toMapBox(box: SceneBox, floorZ: number): CloudEditBox {
  return {
    min: [box.min[0], box.min[1], box.min[2] + floorZ],
    max: [box.max[0], box.max[1], box.max[2] + floorZ],
  }
}

/** The backend's map-frame box to a scene box (heights). */
export function fromMapBox(box: CloudEditBox, floorZ: number): SceneBox {
  return {
    min: [box.min[0], box.min[1], box.min[2] - floorZ],
    max: [box.max[0], box.max[1], box.max[2] - floorZ],
  }
}

/** Whether a point is inside a box, edges included (as the backend's job). */
export function inBox(x: number, y: number, z: number, box: { min: readonly number[]; max: readonly number[] }): boolean {
  return x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2]
}

/** How many x, y, z triples of `points` fall in any of `boxes`; each point
 *  counted once. `points` and the boxes must use the same z (both map z, or
 *  both heights). */
export function countInBoxes(points: Float32Array, boxes: readonly { min: readonly number[]; max: readonly number[] }[]): number {
  if (!boxes.length) return 0
  let n = 0
  for (let k = 0; k + 2 < points.length; k += 3) {
    const x = points[k], y = points[k + 1], z = points[k + 2]
    for (const b of boxes) if (inBox(x, y, z, b)) { n++; break }
  }
  return n
}

/** A box's centre and size in the scene's world space (X = x, Y = height,
 *  Z = -y), for the mesh that draws it. */
export function boxWorld(box: SceneBox): { center: [number, number, number]; size: [number, number, number] } {
  return {
    center: [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2, -(box.min[1] + box.max[1]) / 2],
    size: [box.max[0] - box.min[0], box.max[2] - box.min[2], box.max[1] - box.min[1]],
  }
}

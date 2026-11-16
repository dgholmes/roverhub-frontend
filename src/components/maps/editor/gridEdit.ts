/**
 * The brush's maths on the planning grid, kept out of the components so it can
 * be tested without a canvas.
 *
 * The planning grid is the P5 PGM the backend stores per floor and Nav2 plans
 * on: 254 free (walkable), 0 occupied (blocked), 205 unknown (never seen).
 * The editor works on a copy of its bytes, row 0 = the TOP of the floor (max
 * y), exactly as stored, so a save sends the copy back unchanged except for the
 * painted cells.
 *
 * Erase turns blocked cells walkable; Restore turns walkable cells blocked.
 * Neither touches an unknown cell: ground the survey never saw is not made
 * walkable by a brush, and leaving it unknown keeps the quality check's
 * "surveyed" figures honest.
 */

export const PGM_FREE = 254
export const PGM_OCCUPIED = 0
export const PGM_UNKNOWN = 205

/** Where a floor's grid sits: cells across and up, metres per cell, and the
 *  map-frame position of cell (0, 0)'s lower-left corner. */
export interface FloorFrame {
  w: number
  h: number
  res: number
  origin: [number, number]
}

export type BrushAction = 'erase' | 'restore'
export type BrushShape = 'brush' | 'box'

/** Brush diameters offered, in cells (5 cm cells: 5 cm to 1 m). */
export const BRUSH_SIZES = [1, 3, 5, 9, 15, 21] as const
export const DEFAULT_BRUSH_SIZE = 5

/** The PGM value a stroke paints. */
export const paintValue = (action: BrushAction): number => (action === 'erase' ? PGM_FREE : PGM_OCCUPIED)

/** Whether `action` changes a cell holding `value`. */
export function paints(action: BrushAction, value: number): boolean {
  return action === 'erase' ? value === PGM_OCCUPIED : value === PGM_FREE
}

/** The cell under a map point, as (column, row from the bottom); null off the grid. */
export function cellOf(frame: FloorFrame, x: number, y: number): { i: number; j: number } | null {
  const i = Math.floor((x - frame.origin[0]) / frame.res)
  const j = Math.floor((y - frame.origin[1]) / frame.res)
  if (!(i >= 0 && j >= 0 && i < frame.w && j < frame.h)) return null
  return { i, j }
}

/** A cell's index in the PGM bytes (row 0 at the top). */
export const pgmIndex = (frame: FloorFrame, i: number, j: number): number => (frame.h - 1 - j) * frame.w + i

/** The map point at a cell's centre. */
export function cellCentre(frame: FloorFrame, i: number, j: number): [number, number] {
  return [frame.origin[0] + (i + 0.5) * frame.res, frame.origin[1] + (j + 0.5) * frame.res]
}

/**
 * The cells a round brush of `diameter` cells covers when centred on map point
 * (x, y): every cell whose centre is within the radius, and always the cell
 * under the point itself. PGM indices, no duplicates, clipped to the grid.
 */
export function cellsInDisc(frame: FloorFrame, x: number, y: number, diameter: number): number[] {
  const r = Math.max(0.5, diameter / 2) * frame.res
  const out: number[] = []
  const i0 = Math.max(0, Math.floor((x - r - frame.origin[0]) / frame.res))
  const i1 = Math.min(frame.w - 1, Math.floor((x + r - frame.origin[0]) / frame.res))
  const j0 = Math.max(0, Math.floor((y - r - frame.origin[1]) / frame.res))
  const j1 = Math.min(frame.h - 1, Math.floor((y + r - frame.origin[1]) / frame.res))
  const r2 = r * r
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const [cx, cy] = cellCentre(frame, i, j)
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) out.push(pgmIndex(frame, i, j))
    }
  }
  const under = cellOf(frame, x, y)
  if (under) {
    const k = pgmIndex(frame, under.i, under.j)
    if (!out.includes(k)) out.push(k)
  }
  return out
}

/**
 * The brush dragged from a to b: discs every half cell along the segment, so a
 * fast drag leaves no gaps between pointer events. No duplicates.
 */
export function cellsAlongStroke(
  frame: FloorFrame, a: [number, number], b: [number, number], diameter: number,
): number[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(1, Math.ceil(len / (frame.res / 2)))
  const seen = new Set<number>()
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    for (const k of cellsInDisc(frame, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, diameter)) seen.add(k)
  }
  return [...seen]
}

/** The cells whose centres lie inside the rectangle with corners a and b
 *  (either order), clipped to the grid. PGM indices. */
export function cellsInRect(frame: FloorFrame, a: [number, number], b: [number, number]): number[] {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
  const i0 = Math.max(0, Math.ceil((x0 - frame.origin[0]) / frame.res - 0.5))
  const i1 = Math.min(frame.w - 1, Math.floor((x1 - frame.origin[0]) / frame.res - 0.5))
  const j0 = Math.max(0, Math.ceil((y0 - frame.origin[1]) / frame.res - 0.5))
  const j1 = Math.min(frame.h - 1, Math.floor((y1 - frame.origin[1]) / frame.res - 0.5))
  const out: number[] = []
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(pgmIndex(frame, i, j))
  return out
}

/** One undoable stroke: the cells it changed and what they held before. */
export interface Stroke {
  indices: Uint32Array
  before: Uint8Array
}

/**
 * The planning grid being edited, with Undo. A stroke is opened with `begin`,
 * painted with `apply` (as many times as the pointer moves), and closed with
 * `end`; Undo takes back one whole stroke. A stroke that changed nothing is not
 * kept.
 */
export class PlanningEdit {
  readonly frame: FloorFrame
  readonly pixels: Uint8Array
  private readonly original: Uint8Array
  private readonly done: Stroke[] = []
  private open: Map<number, number> | null = null

  constructor(frame: FloorFrame, pixels: Uint8Array) {
    if (pixels.length !== frame.w * frame.h) {
      throw new Error(`planning grid is ${pixels.length} cells, the floor is ${frame.w}x${frame.h}`)
    }
    this.frame = frame
    this.pixels = Uint8Array.from(pixels)
    this.original = Uint8Array.from(pixels)
  }

  begin(): void {
    if (!this.open) this.open = new Map()
  }

  /** Paint `indices` with `action`; returns how many cells changed. Opens a
   *  stroke if none is open (and leaves it open). */
  apply(indices: readonly number[], action: BrushAction): number {
    this.begin()
    const open = this.open!
    const value = paintValue(action)
    let changed = 0
    for (const k of indices) {
      const v = this.pixels[k]
      if (!paints(action, v)) continue
      if (!open.has(k)) open.set(k, v)
      this.pixels[k] = value
      changed++
    }
    return changed
  }

  /** Close the open stroke; the stroke kept, or null when it changed nothing. */
  end(): Stroke | null {
    const open = this.open
    this.open = null
    if (!open) return null
    // A cell painted and painted back within one stroke is no change.
    const indices: number[] = []
    const before: number[] = []
    for (const [k, v] of open) {
      if (this.pixels[k] === v) continue
      indices.push(k)
      before.push(v)
    }
    if (!indices.length) return null
    const stroke = { indices: Uint32Array.from(indices), before: Uint8Array.from(before) }
    this.done.push(stroke)
    return stroke
  }

  /** Take back the last stroke (closing any open one first). */
  undo(): Stroke | null {
    this.end()
    const stroke = this.done.pop() ?? null
    if (stroke) stroke.indices.forEach((k, n) => { this.pixels[k] = stroke.before[n] })
    return stroke
  }

  /** Strokes that can be undone. */
  get strokes(): number {
    return this.done.length + (this.open?.size ? 1 : 0)
  }

  /** Cells that differ from the grid as it was loaded. */
  changedCells(): number {
    let n = 0
    for (let k = 0; k < this.pixels.length; k++) if (this.pixels[k] !== this.original[k]) n++
    return n
  }

  /** The cells that differ from the grid as loaded, with their values now:
   *  what a save lays over a grid read again (editSession replayBrush). */
  diff(): { indices: Uint32Array; values: Uint8Array } {
    const indices: number[] = []
    for (let k = 0; k < this.pixels.length; k++) if (this.pixels[k] !== this.original[k]) indices.push(k)
    return { indices: Uint32Array.from(indices), values: Uint8Array.from(indices.map((k) => this.pixels[k])) }
  }

  /** The grid as it was loaded (a copy). */
  base(): Uint8Array {
    return Uint8Array.from(this.original)
  }

  /** The edited grid as the P5 PGM the backend stores. */
  encode(): Uint8Array {
    return encodePgm(this.frame.w, this.frame.h, this.pixels)
  }
}

/** A binary PGM (P5, maxval 255): the format parsePgm reads and the backend's
 *  PUT /planning takes. */
export function encodePgm(w: number, h: number, pixels: Uint8Array): Uint8Array {
  if (pixels.length !== w * h) throw new Error(`a ${w}x${h} grid needs ${w * h} bytes, not ${pixels.length}`)
  const header = new TextEncoder().encode(`P5\n${w} ${h}\n255\n`)
  const out = new Uint8Array(header.length + pixels.length)
  out.set(header, 0)
  out.set(pixels, header.length)
  return out
}

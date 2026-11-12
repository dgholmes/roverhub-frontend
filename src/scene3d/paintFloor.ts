import { SCENE_PALETTE_DARK } from './palette'
import { GRID_FURNITURE, GRID_KNOWN, GRID_WALKABLE, GRID_WALL, type ScenePalette, type SceneGrid } from './types'

export type Rgb = [number, number, number]
export type Rgba = [number, number, number, number]

/**
 * `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` or `rgba(...)` (comma or space
 * separated) to 0-255 channels; alpha is dropped. Null for anything else: a
 * canvas probe would read any CSS colour, but would also make this untestable
 * outside a browser, and theme.css only writes these forms.
 */
export function parseColour(value: string): Rgb | null {
  const s = value.trim().toLowerCase()
  let m = /^#([0-9a-f]{3})$/.exec(s)
  if (m) return [0, 1, 2].map((k) => parseInt(m![1][k] + m![1][k], 16)) as Rgb
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s)
  if (m) return [0, 2, 4].map((k) => parseInt(m![1].slice(k, k + 2), 16)) as Rgb
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s)
  if (m) return [1, 2, 3].map((k) => Math.max(0, Math.min(255, Math.round(Number(m![k]))))) as Rgb
  return null
}

/** `a` moved toward `b` by `k` (0 = a, 1 = b), as the options page mixes. */
export function mixRgb(a: Rgb, b: Rgb, k: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

/** Whether a palette is the dark theme's, judged by its background, so the
 * caller does not have to pass the theme alongside the colours it resolved. */
export function isDarkPalette(palette: ScenePalette): boolean {
  const [r, g, b] = rgbOf(palette, 'bg')
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}

/** Layer switches and theme, all optional. */
export interface FloorPaintOptions {
  /** Tint walkable cells toward the accent (default true). Off, they read as floor. */
  showWalkable?: boolean
  /** Paint furniture cells in the furniture colour (default true). Off, floor. */
  showFurniture?: boolean
  /** Overrides `isDarkPalette`; the tint is a little stronger on dark. */
  dark?: boolean
}

/** The resolved colours one paint uses, worked out once rather than per cell. */
export interface FloorColours {
  wall: Rgb
  furn: Rgb
  floor: Rgb
  walk: Rgb
  edge: Rgb
  showWalkable: boolean
  showFurniture: boolean
}

function rgbOf(palette: ScenePalette, key: keyof ScenePalette): Rgb {
  return parseColour(palette[key]) ?? (parseColour(SCENE_PALETTE_DARK[key]) as Rgb)
}

/** The options page's mix: walkable floor 22% (light 16%) toward the accent,
 * its edge 80% (light 75%), so the walkable outline reads before its fill. */
export function floorColours(palette: ScenePalette, opts: FloorPaintOptions = {}): FloorColours {
  const dark = opts.dark ?? isDarkPalette(palette)
  const floor = rgbOf(palette, 'floor')
  const accent = rgbOf(palette, 'accent')
  return {
    wall: rgbOf(palette, 'wall'),
    furn: rgbOf(palette, 'furn'),
    floor,
    walk: mixRgb(floor, accent, dark ? 0.22 : 0.16),
    edge: mixRgb(floor, accent, dark ? 0.8 : 0.75),
    showWalkable: opts.showWalkable ?? true,
    showFurniture: opts.showFurniture ?? true,
  }
}

/** The decision itself, allocation-free for the paint loop: one of the
 * resolved colours, or null for transparent. */
function pick(bits: number, edge: boolean, c: FloorColours): Rgb | null {
  if (bits & GRID_WALL) return c.wall
  if (bits & GRID_FURNITURE) return c.showFurniture ? c.furn : c.floor
  if (bits & GRID_WALKABLE) return c.showWalkable ? (edge ? c.edge : c.walk) : c.floor
  if (bits & GRID_KNOWN) return c.floor
  return null
}

/** One cell's colour from resolved colours. */
export function cellColourFrom(bits: number, edge: boolean, c: FloorColours): Rgba {
  const rgb = pick(bits, edge, c)
  return rgb ? [rgb[0], rgb[1], rgb[2], 255] : [0, 0, 0, 0]
}

/**
 * One cell's colour, by the options page's rules in order: wall, then
 * furniture, then walkable (stronger on an edge), then any other known cell as
 * floor; unknown is transparent. `edge` is whether a walkable cell has a
 * non-walkable neighbour.
 */
export function cellColour(bits: number, edge: boolean, palette: ScenePalette, opts?: FloorPaintOptions): Rgba {
  return cellColourFrom(bits, edge, floorColours(palette, opts))
}

/**
 * Paint the floor grid into a canvas of `grid.w` x `grid.h`, north up: cell
 * (i, j) lands on pixel (i, grid.h - 1 - j). Through one ImageData, which does
 * a 1020 x 880 floor in a few milliseconds.
 *
 * A neighbour outside the grid counts as not walkable, so the grid's border is
 * an edge. (The options page read past the row's end there instead.)
 *
 * With no 2D context (jsdom, or a lost context) the canvas comes back sized
 * but unpainted, rather than throwing out of a render.
 */
export function paintFloor(
  grid: SceneGrid, palette: ScenePalette, canvas?: HTMLCanvasElement, opts?: FloorPaintOptions,
): HTMLCanvasElement {
  const out = canvas ?? document.createElement('canvas')
  const { w, h, bits } = grid
  // Assigning a size clears the canvas, even the same size; only when it changes.
  if (out.width !== w) out.width = w
  if (out.height !== h) out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return out
  const img = ctx.createImageData(w, h)
  const px = img.data
  const c = floorColours(palette, opts)
  const walkable = (k: number) => (bits[k] & GRID_WALKABLE) !== 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      const v = bits[k]
      const edge = (v & GRID_WALKABLE) !== 0 && (
        i === 0 || !walkable(k - 1) || i === w - 1 || !walkable(k + 1) ||
        j === 0 || !walkable(k - w) || j === h - 1 || !walkable(k + w))
      const rgb = pick(v, edge, c)
      const o = ((h - 1 - j) * w + i) * 4
      if (rgb) { px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255 }
      else px[o + 3] = 0
    }
  }
  ctx.putImageData(img, 0, 0)
  return out
}

import { floorColours, mixRgb, parseColour, type Rgb } from '@/scene3d/paintFloor'
import { SCENE_PALETTE_DARK } from '@/scene3d/palette'
import type { ScenePalette } from '@/scene3d/types'

/**
 * How the live survey map is painted, in the console's map colours: walls in
 * the scene's wall colour (white on dark), open floor in the same blue tint the
 * painted floorplan gives walkable cells, and unseen ground left as the map's
 * own dark background. The unseen cells right at the edge of what has been seen
 * are tinted amber: that edge is where the map still has gaps, which is what
 * the operator is driving to close.
 */

export type SurveyCell = 'unseen' | 'open' | 'occupied'

/** The bridge sends 0 / 128 / 255; anything between is read by the nearest,
 * so a resampled or smoothed image still reads sensibly. */
export function surveyCellOf(value: number): SurveyCell {
  if (value < 64) return 'unseen'
  if (value < 192) return 'open'
  return 'occupied'
}

export interface SurveyColours {
  occupied: Rgb
  open: Rgb
  /** Unseen cells next to an open one: the edge still to be covered. */
  frontier: Rgb
}

const rgb = (palette: ScenePalette, key: keyof ScenePalette): Rgb =>
  parseColour(palette[key]) ?? (parseColour(SCENE_PALETTE_DARK[key]) as Rgb)

export function surveyColours(palette: ScenePalette): SurveyColours {
  return {
    occupied: rgb(palette, 'wall'),
    open: floorColours(palette).walk,
    frontier: mixRgb(rgb(palette, 'bg'), rgb(palette, 'amber'), 0.35),
  }
}

/**
 * RGBA for an ImageData of the same size: occupied and open opaque, frontier
 * opaque, every other unseen cell transparent (the pane's background shows).
 */
export function paintSurveyCells(pixels: Uint8Array, width: number, height: number, colours: SurveyColours): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && surveyCellOf(pixels[y * width + x]) === 'open'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const cell = surveyCellOf(pixels[i])
      let c: Rgb | null = null
      if (cell === 'occupied') c = colours.occupied
      else if (cell === 'open') c = colours.open
      else if (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1)) c = colours.frontier
      if (!c) continue
      out[i * 4] = c[0]
      out[i * 4 + 1] = c[1]
      out[i * 4 + 2] = c[2]
      out[i * 4 + 3] = 255
    }
  }
  return out
}

/** Cells of each kind, for the summary line and the tests. */
export function countSurveyCells(pixels: Uint8Array): Record<SurveyCell, number> {
  const counts: Record<SurveyCell, number> = { unseen: 0, open: 0, occupied: 0 }
  for (let i = 0; i < pixels.length; i++) counts[surveyCellOf(pixels[i])]++
  return counts
}

import { describe, expect, it } from 'vitest'
import { CONTENT_MARGIN_M, contentBoundsM, surveyedFractionOfGrid } from './contentBounds'
import type { SceneGrid } from '@/scene3d/types'

/** 100 x 50 cells of 10 cm, lower-left corner at (-5, -2) m. Its content sits
 * in cells x 20..39, y 10..29 -- so x -3.0..-1.0 m and y -1.0..1.0 m. */
const grid: SceneGrid = {
  w: 100, h: 50, res: 0.1, origin: [-5, -2], bits: new Uint8Array(0),
  content: { minX: 20, minY: 10, maxX: 39, maxY: 29 },
}

describe('contentBoundsM', () => {
  it('converts the content cell box to metre bounds with a margin', () => {
    // Cells are whole: the high edge of cell 39 is origin + 40 * res.
    // x: -5 + 2.0 .. -5 + 4.0 = -3.0 .. -1.0, grown by 1 m  -> -4.0 .. 0.0
    // y: -2 + 1.0 .. -2 + 3.0 = -1.0 ..  1.0, grown by 1 m  -> -2.0 .. 2.0
    expect(contentBoundsM(grid, 1)).toEqual([[-2, -4], [2, 0]])
  })

  it('defaults to CONTENT_MARGIN_M', () => {
    expect(contentBoundsM(grid)).toEqual(contentBoundsM(grid, CONTENT_MARGIN_M))
  })

  it('never reports a zero-sized box, so Leaflet cannot zoom to a point', () => {
    const dot: SceneGrid = { ...grid, content: { minX: 5, minY: 5, maxX: 5, maxY: 5 } }
    const [[yLo, xLo], [yHi, xHi]] = contentBoundsM(dot, 0)
    expect(xHi).toBeGreaterThan(xLo)
    expect(yHi).toBeGreaterThan(yLo)
  })

  it('sheds float noise the way boundsForFloor does', () => {
    const awkward: SceneGrid = { ...grid, res: 0.05, origin: [-17.8671, -5.4753] }
    for (const pair of contentBoundsM(awkward) as [number, number][]) {
      for (const n of pair) expect(n).toBe(Math.round(n * 1e6) / 1e6)
    }
  })
})

describe('surveyedFractionOfGrid', () => {
  it('is 1 when the content fills the grid', () => {
    const full: SceneGrid = { ...grid, content: { minX: 0, minY: 0, maxX: 99, maxY: 49 } }
    expect(surveyedFractionOfGrid(full)).toBe(1)
  })

  it('matches the active map: a 58 x 25 m grid holding 19 x 22 m of content', () => {
    // 1160 x 500 cells of 5 cm; content cells 760..1139 across, 20..459 up.
    const active: SceneGrid = {
      w: 1160, h: 500, res: 0.05, origin: [-43.9492, -19.7217], bits: new Uint8Array(0),
      content: { minX: 760, minY: 20, maxX: 1139, maxY: 459 },
    }
    // 380 x 440 cells of 1160 x 500 = 0.288 -> 71% of the canvas never surveyed.
    expect(surveyedFractionOfGrid(active)).toBeCloseTo(0.288, 3)
  })
})

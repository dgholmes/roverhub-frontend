// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// A Rectangle needs a live Leaflet map, which a test does not have. Stand it in
// with a tag carrying the props that decide how it looks.
vi.mock('react-leaflet', () => ({
  Rectangle: (p: { bounds: unknown; pathOptions?: Record<string, unknown>; interactive?: boolean }) => (
    <i
      data-testid="outline"
      data-bounds={JSON.stringify(p.bounds)}
      data-opts={JSON.stringify(p.pathOptions ?? {})}
      data-interactive={String(p.interactive)}
    />
  ),
}))

import { color } from '@/design-system/tokens'
import { boundsForFloor } from '@/liveops/mapFloor'
import type { SceneGrid } from '@/scene3d/types'
import type { MapFloor } from '@/types/maps'
import { SURVEYED_SHARE_QUIET, UnsurveyedLayer, unsurveyedExtent } from './UnsurveyedLayer'

/**
 * The active map as measured on 2026-11-25: a 58.0 x 25.0 m grid holding
 * 19.0 x 22.0 m of surveyed content, 71% of the rectangle never surveyed.
 * 5 cm cells, so 1160 x 500 cells of grid and 380 x 440 cells of content.
 */
const floor: MapFloor = {
  index: 0, label: 'Ground', floor_z_m: 0,
  resolution_m: 0.05, origin_xy_m: [-43.9, -10], size_cells: [1160, 500],
  free_cells: 120000, occupied_cells: 47200, unknown_cells: 412800,
}

const grid: SceneGrid = {
  w: 1160, h: 500, res: 0.05, origin: [-43.9, -10],
  // `bits` is never read by this layer, so it is not worth half a megabyte.
  bits: new Uint8Array(0),
  content: { minX: 0, minY: 0, maxX: 379, maxY: 439 },
}

/** A grid whose content box is the whole rectangle: nothing was wasted. */
const full: SceneGrid = { ...grid, content: { minX: 0, minY: 0, maxX: 1159, maxY: 499 } }

const opts = (html: string) =>
  JSON.parse(/data-opts="([^"]*)"/.exec(html)![1].replace(/&quot;/g, '"')) as Record<string, unknown>

describe('unsurveyedExtent', () => {
  it('measures the grid in metres and the share of it never surveyed', () => {
    expect(unsurveyedExtent(grid)).toEqual({
      widthM: 58, heightM: 25, surveyedShare: (380 * 440) / (1160 * 500), unsurveyedPercent: 71,
    })
  })

  it('reports nothing wasted when the content box is the whole grid', () => {
    expect(unsurveyedExtent(full)).toMatchObject({ surveyedShare: 1, unsurveyedPercent: 0 })
  })

  it('rounds the wasted share down, so the caption never flatters the survey', () => {
    // 1 cell of 4: exactly 75% wasted. 3 of 4 is 25%, not 26%.
    const quarter = { ...grid, w: 2, h: 2, content: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
    expect(unsurveyedExtent(quarter).unsurveyedPercent).toBe(75)
    const threeQuarters = { ...quarter, w: 4, h: 1, content: { minX: 0, minY: 0, maxX: 2, maxY: 0 } }
    expect(unsurveyedExtent(threeQuarters).unsurveyedPercent).toBe(25)
  })

  it('calls an empty grid wholly unsurveyed rather than dividing by zero', () => {
    const empty = { ...grid, w: 0, h: 0 }
    expect(unsurveyedExtent(empty)).toMatchObject({ surveyedShare: 0, unsurveyedPercent: 100 })
  })
})

describe('UnsurveyedLayer', () => {
  it('outlines the whole grid rectangle, dashed, unfilled and out of the way of a tap', () => {
    const html = renderToStaticMarkup(<UnsurveyedLayer floor={floor} grid={grid} />)
    expect(html).toContain(`data-bounds="${JSON.stringify(boundsForFloor(floor)).replace(/"/g, '&quot;')}"`)
    expect(opts(html)).toMatchObject({ color: color.t3, fill: false })
    expect(opts(html).dashArray).toBeTruthy()
    expect(html).toContain('data-interactive="false"')
  })

  it('draws nothing at all when the content already fills the grid', () => {
    expect(renderToStaticMarkup(<UnsurveyedLayer floor={floor} grid={full} />)).toBe('')
  })

  it('stays quiet just above the threshold and speaks up just below it', () => {
    // A square content box covering 91% of a square grid, then 89% of one.
    const square = (share: number): SceneGrid => {
      const side = Math.round(1000 * Math.sqrt(share))
      return { ...grid, w: 1000, h: 1000, content: { minX: 0, minY: 0, maxX: side - 1, maxY: side - 1 } }
    }
    expect(SURVEYED_SHARE_QUIET).toBe(0.9)
    expect(renderToStaticMarkup(<UnsurveyedLayer floor={floor} grid={square(0.91)} />)).toBe('')
    expect(renderToStaticMarkup(<UnsurveyedLayer floor={floor} grid={square(0.89)} />)).not.toBe('')
  })

  it('reports the grid size and the share never surveyed', () => {
    const html = renderToStaticMarkup(
      <UnsurveyedLayer
        floor={floor} grid={grid}
        caption={(e) => `${e.widthM} × ${e.heightM} m, ${e.unsurveyedPercent}% never surveyed`}
      />,
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('58 × 25 m, 71% never surveyed')
  })

  it('takes a plain translated string as its caption, and a second line under it', () => {
    const html = renderToStaticMarkup(
      <UnsurveyedLayer floor={floor} grid={grid} caption="Grid outline" captionHint="Trim it to what you surveyed" />,
    )
    expect(html).toContain('Grid outline')
    expect(html).toContain('Trim it to what you surveyed')
  })

  it('still outlines the grid when no caption was supplied, and says nothing', () => {
    const html = renderToStaticMarkup(<UnsurveyedLayer floor={floor} grid={grid} />)
    expect(html).toContain('data-testid="outline"')
    expect(html).not.toContain('role="status"')
  })

  it('draws no hairline border around the caption, per the house style', () => {
    const html = renderToStaticMarkup(<UnsurveyedLayer floor={floor} grid={grid} caption="x" />)
    expect(html).not.toMatch(/border:\s*\d+px solid/)
  })

  it('renders nothing for a floor index the map does not have', () => {
    expect(renderToStaticMarkup(<UnsurveyedLayer floor={undefined} grid={grid} caption="x" />)).toBe('')
  })
})

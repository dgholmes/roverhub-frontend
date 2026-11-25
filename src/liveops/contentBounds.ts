import type { LatLngBoundsLiteral } from 'leaflet'
import type { SceneGrid } from '@/scene3d/types'

/**
 * Where a surveyed floor's *content* is, as against where its grid is.
 *
 * ⚠️ These are not the same box, and on every map we have stored they are not
 * even close. FAST-LIO2's grid is sized from the whole registered cloud, so a
 * handful of returns through a window or along a corridor the robot only
 * looked down stretch the rectangle to somewhere nothing can be sent. Measured
 * 2026-11-25:
 *
 *   survey 2026-11-20 15:08   grid 58.0 x 25.0 m   content 19.0 x 22.0 m
 *   map-office-survey2        grid 51.0 x 44.0 m   content 23.1 x 23.6 m
 *   survey 2026-11-20 11:33   grid 23.0 x 25.0 m   content 20.1 x 22.7 m
 *   map-venue                 grid 20.0 x 24.0 m   content 16.7 x 20.8 m
 *
 * On the first of those -- the active map -- 71% of the rectangle holds not
 * one surveyed cell, and all of the emptiness lies to the left of the
 * building. Fitting the view to the grid therefore drew a real 19 x 22 m
 * office as a small patch against the right-hand edge of its pane, which is
 * exactly what the operator reported (user, 2026-11-25).
 *
 * The painted floorplan has always cropped itself to the content
 * (useFloorCanvas.cropCells); only the fit was still framing the rectangle.
 * This module is the content box in metres, so the fit can frame it too.
 *
 * Trim (Missions › Maps, backend maps/trim.py) is the data-level answer and
 * stays worth running, but it is NOT a substitute for this: it cuts to the
 * walked track plus 10 m, and on the active map that still leaves a
 * 31.6 x 25 m rectangle around 19 x 22 m of content.
 */

/** Metres of room left around the surveyed content when the view is fitted to
 * it. Enough that the outermost wall is not flush against the pane edge, small
 * enough that it does not reintroduce the emptiness this exists to remove. */
export const CONTENT_MARGIN_M = 1.0

/** Rounded to a micrometre, for the reason boundsForFloor rounds: `-17.8671 +
 * 24` is not exactly `6.1329`, and a cell is 5 cm. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * The surveyed content's extent in map-frame metres, grown by `marginM`, as
 * Leaflet `[[yLo, xLo], [yHi, xHi]]` bounds.
 *
 * `content` is a box of whole cells with both ends inclusive, so the high edge
 * is the far side of cell `max`, i.e. `origin + (max + 1) * res`. That `+ 1`
 * is also why the box is never zero-sized even with no margin and a single
 * surveyed cell: it is always at least one cell across, and `fitBounds` on a
 * zero-sized box zooms Leaflet to its maximum.
 */
export function contentBoundsM(grid: SceneGrid, marginM: number = CONTENT_MARGIN_M): LatLngBoundsLiteral {
  const [x0, y0] = grid.origin
  const xLo = x0 + grid.content.minX * grid.res - marginM
  const xHi = x0 + (grid.content.maxX + 1) * grid.res + marginM
  const yLo = y0 + grid.content.minY * grid.res - marginM
  const yHi = y0 + (grid.content.maxY + 1) * grid.res + marginM
  return [[round6(yLo), round6(xLo)], [round6(yHi), round6(xHi)]]
}

/**
 * How much of the grid's rectangle the surveyed content covers, by area, from
 * 0 to 1. `1 - this` is the share of the canvas that was never surveyed, which
 * is what the unsurveyed-outline caption reports.
 */
export function surveyedFractionOfGrid(grid: SceneGrid): number {
  if (grid.w <= 0 || grid.h <= 0) return 1
  const w = grid.content.maxX - grid.content.minX + 1
  const h = grid.content.maxY - grid.content.minY + 1
  return Math.min(1, (w * h) / (grid.w * grid.h))
}

/** Metres across the inset map frames around the robot. A room and its
 * doorways, which is what the operator needs from a glance at the inset. */
export const MINI_FOLLOW_SPAN_M = 12

/**
 * The window a small inset map frames: `spanM` metres square around the robot,
 * clamped on each axis so it never reaches past the surveyed content.
 *
 * A 176 x 106 px inset showing a whole site is a thumbnail, not a view -- the
 * robot is a dot and its surroundings are unreadable. The operator asked for
 * the inset to show where the robot is at the scale the main map uses (user,
 * 2026-11-25), so it frames a room's worth and follows.
 *
 * The clamp is per axis and only ever shrinks the window, so a floor narrower
 * than `spanM` shows the floor rather than empty grid beside it. The robot is
 * always inside: a robot standing outside the content widens the window back
 * out to reach it, because an inset that has lost the robot is worse than one
 * that is zoomed out.
 */
export function miniWindow(
  position: { x_m: number; y_m: number },
  content: LatLngBoundsLiteral | null,
  spanM = MINI_FOLLOW_SPAN_M,
): LatLngBoundsLiteral {
  const half = spanM / 2
  const { x_m, y_m } = position
  let xLo = x_m - half, xHi = x_m + half, yLo = y_m - half, yHi = y_m + half
  if (content) {
    const [[cyLo, cxLo], [cyHi, cxHi]] = content
    if (cxHi - cxLo < spanM) { xLo = cxLo; xHi = cxHi }
    if (cyHi - cyLo < spanM) { yLo = cyLo; yHi = cyHi }
    // Never lose the robot to the clamp.
    xLo = Math.min(xLo, x_m); xHi = Math.max(xHi, x_m)
    yLo = Math.min(yLo, y_m); yHi = Math.max(yHi, y_m)
  }
  return [[round6(yLo), round6(xLo)], [round6(yHi), round6(xHi)]]
}

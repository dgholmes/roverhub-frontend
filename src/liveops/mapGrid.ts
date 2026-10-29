import type { LatLngBoundsLiteral } from 'leaflet'

/** One grid line as Leaflet positions: `[[lat, lng], [lat, lng]]`. */
export type GridLine = [[number, number], [number, number]]

/**
 * The vertical and horizontal lines of the ground-plane grid, every `step`
 * units across `bounds`. Pure, so GridLayer can memoize it: the grid is 122
 * polylines at the default bounds, and recomputing (and re-rendering) all of
 * them on every telemetry frame was most of the map's render work.
 */
export function gridLines(bounds: LatLngBoundsLiteral, step: number): GridLine[] {
  if (!(step > 0)) return []
  const [[y0, x0], [y1, x1]] = bounds
  const lines: GridLine[] = []
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    lines.push([[y0, x], [y1, x]])
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    lines.push([[y, x0], [y, x1]])
  }
  return lines
}

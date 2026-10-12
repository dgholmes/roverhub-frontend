import { Polyline } from 'react-leaflet'
import type { LatLngBoundsLiteral } from 'leaflet'
import { color } from '@/design-system/tokens'

/** Synthetic ground-plane grid — this is a private-site robot with no GPS in
 * MVP, so the "map" is an offline plan, not geo tiles (see map-substrate note). */
export function GridLayer({ bounds, step = 10 }: { bounds: LatLngBoundsLiteral; step?: number }) {
  const [[y0, x0], [y1, x1]] = bounds
  const lines: [number, number][][] = []

  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    lines.push([[y0, x], [y1, x]])
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    lines.push([[y, x0], [y, x1]])
  }

  return (
    <>
      {lines.map((positions, i) => (
        <Polyline key={i} positions={positions} pathOptions={{ color: color.mapGrid, weight: 1, interactive: false }} />
      ))}
    </>
  )
}

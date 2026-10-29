import { memo, useMemo } from 'react'
import { Polyline } from 'react-leaflet'
import type { LatLngBoundsLiteral } from 'leaflet'
import { color } from '@/design-system/tokens'
import { gridLines } from '@/liveops/mapGrid'

/** Synthetic ground-plane grid — this is a private-site robot with no GPS in
 * MVP, so the "map" is an offline plan, not geo tiles (see map-substrate note).
 *
 * Memoized, with the lines memoized inside: MapCanvas re-renders on every
 * telemetry frame (its `robot` prop), and without this every one of the 122
 * grid polylines re-rendered with it -- about 2,400 component renders a second
 * that changed nothing on screen. In a development build React records a
 * performance.measure() for each of those, and the browser keeps every entry,
 * which is how a LiveOps tab ran out of memory (2026-10-29; see main.tsx). */
export const GridLayer = memo(function GridLayer({ bounds, step = 10 }: { bounds: LatLngBoundsLiteral; step?: number }) {
  const lines = useMemo(() => gridLines(bounds, step), [bounds, step])

  return (
    <>
      {lines.map((positions, i) => (
        <Polyline key={i} positions={positions} pathOptions={{ color: color.mapGrid, weight: 1, interactive: false }} />
      ))}
    </>
  )
})

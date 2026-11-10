import { memo, useMemo } from 'react'
import { Polygon } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MapZone } from '@/types/maps'

/**
 * The site boundary: the `geofence` ones among `zones`, and nothing without
 * them. It has no fallback of its own. Callers pass a surveyed map's zones, or
 * the provider's sample site (`dataProvider.sampleSite()`), which is the mock
 * perimeter in mock mode and nothing on the real backend.
 *
 * Memoized: nothing it draws changes per telemetry frame (see GridLayer), and
 * callers must pass a referentially stable `zones`.
 */
export const GeofenceLayer = memo(function GeofenceLayer({ zones }: { zones?: readonly MapZone[] }) {
  const shapes = useMemo(
    () => (zones ?? []).filter((z) => z.kind === 'geofence')
      .map((z) => ({ id: z.zone_id, positions: z.polygon.map(([x, y]) => toLatLng(x, y)) })),
    [zones],
  )
  return (
    <>
      {shapes.map((shape) => (
        <Polygon
          key={shape.id}
          positions={shape.positions}
          pathOptions={{ color: color.t3, weight: 1.5, fillColor: color.mapZone, fillOpacity: 0.5, dashArray: '6 4' }}
          interactive={false}
        />
      ))}
    </>
  )
})

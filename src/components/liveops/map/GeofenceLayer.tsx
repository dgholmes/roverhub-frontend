import { memo, useMemo } from 'react'
import { Polygon } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import { geofence } from '@/mocks/mockGeoZones'
import type { MapZone } from '@/types/maps'

/**
 * The site boundary. With a surveyed map's `zones` it draws that map's
 * `geofence` ones (an empty list draws nothing); with none it draws the mock
 * perimeter, as MapCanvas still does.
 *
 * Memoized: nothing it draws changes per telemetry frame (see GridLayer), and
 * callers must pass a referentially stable `zones`.
 */
export const GeofenceLayer = memo(function GeofenceLayer({ zones }: { zones?: readonly MapZone[] }) {
  const shapes = useMemo(
    () => zones
      ? zones.filter((z) => z.kind === 'geofence')
        .map((z) => ({ id: z.zone_id, positions: z.polygon.map(([x, y]) => toLatLng(x, y)) }))
      : [{ id: 'mock-geofence', positions: geofence.map((p) => toLatLng(p.x_m, p.y_m)) }],
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

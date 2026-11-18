import { memo, useMemo } from 'react'
import { Polygon } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MapZone } from '@/types/maps'

/**
 * The site boundary of a surveyed map. An empty list draws nothing.
 *
 * ⚠️ `zones` is required, and there is no fallback — see the note on
 * NoGoZoneLayer. It used to default to the mock site's perimeter, which three
 * callers then drew around real data. Use
 * `mapZonesFor(missionMapId, loadedMap)`. Audit 2026-11-18 §4.2 / §8.6.
 *
 * Memoized: nothing it draws changes per telemetry frame (see GridLayer), and
 * callers must pass a referentially stable `zones`.
 */
export const GeofenceLayer = memo(function GeofenceLayer({ zones }: { zones: readonly MapZone[] }) {
  const shapes = useMemo(
    () => zones.filter((z) => z.kind === 'geofence')
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

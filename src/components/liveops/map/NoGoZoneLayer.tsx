import { memo, useMemo } from 'react'
import { Polygon, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import { noGoZones } from '@/mocks/mockGeoZones'
import type { MapZone } from '@/types/maps'

/**
 * The no-go zones. With a surveyed map's `zones` it draws that map's `no_go`
 * ones (an empty list draws nothing: a surveyed map with no zones is not the
 * mock site); with none it draws the mock zones, as MapCanvas still does.
 *
 * Memoized: nothing it draws changes per telemetry frame (see GridLayer), and
 * callers must pass a referentially stable `zones`.
 */
export const NoGoZoneLayer = memo(function NoGoZoneLayer({ zones }: { zones?: readonly MapZone[] }) {
  const shapes = useMemo(
    () => zones
      ? zones.filter((z) => z.kind === 'no_go')
        .map((z) => ({ id: z.zone_id, label: z.label, positions: z.polygon.map(([x, y]) => toLatLng(x, y)) }))
      : noGoZones.map((z) => ({ id: z.id, label: z.label, positions: z.points.map((p) => toLatLng(p.x_m, p.y_m)) })),
    [zones],
  )
  return (
    <>
      {shapes.map((zone) => (
        <Polygon
          key={zone.id}
          positions={zone.positions}
          pathOptions={{ color: color.red, weight: 1.5, fillColor: color.red, fillOpacity: 0.12 }}
        >
          <Tooltip sticky>{zone.label}</Tooltip>
        </Polygon>
      ))}
    </>
  )
})

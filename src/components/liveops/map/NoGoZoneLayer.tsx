import { memo, useMemo } from 'react'
import { Polygon, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MapZone } from '@/types/maps'

/**
 * The no-go zones: the `no_go` ones among `zones`, and nothing without them.
 * Like GeofenceLayer it has no fallback of its own; the mock site's zones come
 * from the mock provider's sample site, never from here.
 *
 * Memoized: nothing it draws changes per telemetry frame (see GridLayer), and
 * callers must pass a referentially stable `zones`.
 */
export const NoGoZoneLayer = memo(function NoGoZoneLayer({ zones }: { zones?: readonly MapZone[] }) {
  const shapes = useMemo(
    () => (zones ?? []).filter((z) => z.kind === 'no_go')
      .map((z) => ({ id: z.zone_id, label: z.label, positions: z.polygon.map(([x, y]) => toLatLng(x, y)) })),
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

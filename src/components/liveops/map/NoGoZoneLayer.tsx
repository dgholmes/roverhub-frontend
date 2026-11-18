import { memo, useMemo } from 'react'
import { Polygon, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MapZone } from '@/types/maps'

/**
 * The no-go zones of a surveyed map. An empty list draws nothing, which is the
 * right answer both for a surveyed map with no zones and for a map we do not
 * have.
 *
 * ⚠️ `zones` is required, and there is no fallback. It used to be optional and
 * default to the mock site's polygons — and three callers (RunPage,
 * SnapshotMap, RoutePreviewMap) passed nothing at all, unconditionally. So a
 * run page drew demo exclusion zones underneath the waypoints a real robot had
 * actually executed, with no way for an operator to tell they were fiction.
 * Drawing nothing is honest; drawing somewhere else's safety geometry is not.
 * Use `mapZonesFor(missionMapId, loadedMap)`. Audit 2026-11-18 §4.2 / §8.6.
 *
 * Memoized: nothing it draws changes per telemetry frame (see GridLayer), and
 * callers must pass a referentially stable `zones`.
 */
export const NoGoZoneLayer = memo(function NoGoZoneLayer({ zones }: { zones: readonly MapZone[] }) {
  const shapes = useMemo(
    () => zones.filter((z) => z.kind === 'no_go')
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

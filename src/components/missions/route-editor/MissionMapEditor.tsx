import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { EditableRouteLayer } from './EditableRouteLayer'
import { MapClickHandler } from './MapClickHandler'
import type { MissionWaypoint } from '@/types'

/**
 * Missions' RouteEditor map (docs/05-ui-ux.md §11.2) — reuses the same
 * ground-plane primitives LiveOps' MapCanvas uses (grid, geofence, no-go
 * zones), but click-to-place-waypoint instead of live robot tracking. Built
 * as its own component rather than overloading MapCanvas, which is read-only
 * by design — cramming editing interaction into it would mean two very
 * different interaction models in one already-dense component.
 */
export function MissionMapEditor({
  waypoints, selectedId, onSelect, onAddWaypoint,
}: {
  waypoints: MissionWaypoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddWaypoint: (x_m: number, y_m: number) => void
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        crs={L.CRS.Simple}
        bounds={MAP_BOUNDS}
        style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false}
        attributionControl={false}
        minZoom={2}
        maxZoom={7}
      >
        <GridLayer bounds={MAP_BOUNDS} />
        <GeofenceLayer />
        <NoGoZoneLayer />
        <EditableRouteLayer waypoints={waypoints} selectedId={selectedId} onSelect={onSelect} />
        <MapClickHandler onAdd={onAddWaypoint} />
      </MapContainer>
    </div>
  )
}

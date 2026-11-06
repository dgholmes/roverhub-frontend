import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { EditableRouteLayer } from './EditableRouteLayer'
import { MapClickHandler } from './MapClickHandler'
import { FitToRoute } from './FitToRoute'
import type { MissionWaypoint } from '@/types'

/**
 * Missions' RouteEditor map (docs/05-ui-ux.md §11.2) — reuses the same
 * ground-plane primitives LiveOps' MapCanvas uses (grid, geofence, no-go
 * zones), but click-to-place-waypoint instead of live robot tracking. Built
 * as its own component rather than overloading MapCanvas, which is read-only
 * by design — cramming editing interaction into it would mean two very
 * different interaction models in one already-dense component.
 */
/** Wider than the site, so panning never reaches a hard edge of grid. */
const GRID_BOUNDS: L.LatLngBoundsLiteral = [[-300, -300], [300, 300]]

export function MissionMapEditor({
  waypoints, selectedId, onSelect, onAddWaypoint, flagged, fitKey = 'route',
}: {
  /** Changes when a different mission opens, so the map fits again. */
  fitKey?: string
  flagged?: Record<string, 'error' | 'warning'>
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
        minZoom={1}
        maxZoom={7}
        // Fine fractional zoom: whole steps left the route at about half the
        // size the pane could show it, and even quarter steps stopped ~20% short.
        zoomSnap={0.1}
        zoomDelta={0.5}
      >
        <FitToRoute waypoints={waypoints} fitKey={fitKey} />
        <GridLayer bounds={GRID_BOUNDS} />
        <GeofenceLayer />
        <NoGoZoneLayer />
        <EditableRouteLayer waypoints={waypoints} selectedId={selectedId} onSelect={onSelect} flagged={flagged} />
        <MapClickHandler onAdd={onAddWaypoint} />
      </MapContainer>
    </div>
  )
}

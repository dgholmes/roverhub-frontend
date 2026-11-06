import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { EditableRouteLayer } from './route-editor/EditableRouteLayer'
import { FitToRoute } from './route-editor/FitToRoute'
import type { MissionWaypoint } from '@/types'

const GRID_BOUNDS: L.LatLngBoundsLiteral = [[-300, -300], [300, 300]]
const noop = () => {}

/**
 * The mission library's preview: the site with one mission's route on it,
 * pannable and zoomable but not editable. The same layers the editor draws,
 * so a route looks the same in both places.
 */
export function RoutePreviewMap({ missionId, waypoints, flagged, padding }: {
  missionId: string
  waypoints: MissionWaypoint[]
  flagged?: Record<string, 'error' | 'warning'>
  padding: { topLeft: [number, number]; bottomRight: [number, number] }
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, isolation: 'isolate' }}>
      <MapContainer
        crs={L.CRS.Simple} bounds={MAP_BOUNDS}
        style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false} attributionControl={false}
        minZoom={1} maxZoom={7} zoomSnap={0.1} zoomDelta={0.5}
      >
        <FitToRoute waypoints={waypoints} fitKey={missionId} padding={padding} />
        <GridLayer bounds={GRID_BOUNDS} />
        <GeofenceLayer />
        <NoGoZoneLayer />
        <EditableRouteLayer waypoints={waypoints} selectedId={null} onSelect={noop} flagged={flagged} />
      </MapContainer>
    </div>
  )
}

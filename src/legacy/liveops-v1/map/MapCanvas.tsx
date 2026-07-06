import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { GridLayer } from './GridLayer'
import { GeofenceLayer } from './GeofenceLayer'
import { NoGoZoneLayer } from './NoGoZoneLayer'
import { RouteLayer } from './RouteLayer'
import { DockMarker } from './DockMarker'
import { AnnotationLayer } from './AnnotationLayer'
import { RobotMarker } from './RobotMarker'
import { MapControls } from './MapControls'
import type { Mission, RobotState } from '@/legacy/liveops-v1/types'

export const MAP_BOUNDS: L.LatLngBoundsLiteral = [[-40, -20], [40, 80]]

/**
 * Map-first center of LiveOps (docs/05-ui-ux.md §1.1). CRS.Simple with
 * meters-as-units since MVP has no GPS (dead-reckoning only).
 *
 * `variant="full"` is the interactive hero view with map controls. `variant="mini"`
 * is the non-interactive inset preview shown when the camera feed is the hero
 * (route + robot only, no geofence/no-go clutter at small size) — the state
 * pill and telemetry HUD are owned by the surrounding HeroView, not this
 * component, so they render exactly once regardless of which view is dominant.
 */
export function MapCanvas({
  robot, mission, variant = 'full',
}: {
  robot: RobotState
  mission?: Mission
  variant?: 'full' | 'mini'
}) {
  const isMini = variant === 'mini'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        crs={L.CRS.Simple}
        bounds={MAP_BOUNDS}
        style={{ height: '100%', width: '100%', background: '#0A0D12' }}
        zoomControl={false}
        attributionControl={false}
        dragging={!isMini}
        scrollWheelZoom={!isMini}
        doubleClickZoom={!isMini}
        boxZoom={!isMini}
        keyboard={!isMini}
        touchZoom={!isMini}
        minZoom={2}
        maxZoom={7}
      >
        <GridLayer bounds={MAP_BOUNDS} />
        {!isMini && <GeofenceLayer />}
        {!isMini && <NoGoZoneLayer />}
        {mission && <RouteLayer mission={mission} />}
        {mission && <DockMarker coord={mission.dock_coord} />}
        {!isMini && <AnnotationLayer />}
        <RobotMarker robot={robot} />
        {!isMini && <MapControls robot={robot} mission={mission} bounds={MAP_BOUNDS} />}
      </MapContainer>
    </div>
  )
}

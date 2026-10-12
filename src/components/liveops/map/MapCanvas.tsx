import { useState } from 'react'
import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { GridLayer } from './GridLayer'
import { GeofenceLayer } from './GeofenceLayer'
import { NoGoZoneLayer } from './NoGoZoneLayer'
import { RouteLayer } from './RouteLayer'
import { DockMarker } from './DockMarker'
import { AnnotationLayer } from './AnnotationLayer'
import { RobotMarker } from './RobotMarker'
import { MapControls } from './MapControls'
import { FitToSite, type FitPadding } from './FitToSite'
import { color } from '@/design-system/tokens'
import type { Mission, RobotState } from '@/types'

export const MAP_BOUNDS: L.LatLngBoundsLiteral = [[-40, -20], [40, 80]]

/** The grid extends well past the site so the canvas never ends in a hard
 * edge when the operator pans or the view is wider than the site. */
const GRID_BOUNDS: L.LatLngBoundsLiteral = [[-300, -300], [300, 300]]

const DEFAULT_FIT: FitPadding = { topLeft: [24, 24], bottomRight: [24, 24] }

export interface MapLayerVisibility {
  geofence: boolean
  noGoZones: boolean
  annotations: boolean
  otherRobots: boolean
}

const DEFAULT_LAYERS: MapLayerVisibility = {
  geofence: true, noGoZones: true, annotations: true, otherRobots: true,
}

/**
 * Map-first center of LiveOps (docs/05-ui-ux.md §1.1). CRS.Simple with
 * meters-as-units since MVP has no GPS (dead-reckoning only).
 *
 * `variant="full"` is the interactive hero view with map controls. `variant="mini"`
 * is the non-interactive inset preview shown when the camera feed is the hero
 * (route + robot only, no geofence/no-go clutter at small size) — the state
 * pill and telemetry HUD are owned by the surrounding HeroView, not this
 * component, so they render exactly once regardless of which view is dominant.
 *
 * Shows every site robot (LVO-006), not just the selected one — other robots
 * render dimmed/smaller via RobotMarker's `selected` prop and are clickable to
 * switch focus. Scoped to the full map only; the mini inset stays
 * uncluttered. Layer visibility (geofence/no-go/annotations/other robots) is
 * operator-toggleable via MapControls, all on by default.
 */
export function MapCanvas({
  robot, mission, variant = 'full', fitPadding,
}: {
  robot: RobotState
  mission?: Mission
  variant?: 'full' | 'mini'
  /** Space to keep clear of floating panels when fitting the site. */
  fitPadding?: FitPadding
}) {
  const isMini = variant === 'mini'
  const robots = useLiveOpsStore((s) => s.robots)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const [layers, setLayers] = useState<MapLayerVisibility>(DEFAULT_LAYERS)

  const toggleLayer = (key: keyof MapLayerVisibility) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }))

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        crs={L.CRS.Simple}
        bounds={MAP_BOUNDS}
        style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false}
        attributionControl={false}
        dragging={!isMini}
        scrollWheelZoom={!isMini}
        doubleClickZoom={!isMini}
        boxZoom={!isMini}
        keyboard={!isMini}
        touchZoom={!isMini}
        minZoom={1}
        maxZoom={7}
        // Fractional zoom: whole-step snapping left the site at roughly half
        // the size the canvas could show it.
        zoomSnap={0.25}
        zoomDelta={0.5}
      >
        <FitToSite robot={robot} mission={mission} padding={isMini ? { topLeft: [8, 8], bottomRight: [8, 8] } : fitPadding ?? DEFAULT_FIT} />
        <GridLayer bounds={GRID_BOUNDS} />
        {!isMini && layers.geofence && <GeofenceLayer />}
        {!isMini && layers.noGoZones && <NoGoZoneLayer />}
        {mission && <RouteLayer mission={mission} />}
        {mission && <DockMarker coord={mission.dock_coord} />}
        {!isMini && layers.annotations && <AnnotationLayer />}
        {!isMini && layers.otherRobots && robots
          .filter((r) => r.robot_id !== robot.robot_id)
          .map((r) => (
            <RobotMarker key={r.robot_id} robot={r} selected={false} onSelect={() => setSelectedRobot(r.robot_id)} />
          ))}
        <RobotMarker robot={robot} selected />
        {!isMini && (
          <MapControls
            robot={robot} mission={mission} bounds={MAP_BOUNDS}
            layers={layers} onToggleLayer={toggleLayer}
          />
        )}
      </MapContainer>
    </div>
  )
}

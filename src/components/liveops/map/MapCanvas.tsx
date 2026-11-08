import { useSiteRobots } from '@/org/useSiteRobots'
import { useCallback, useState } from 'react'
import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { useSessionStore } from '@/store/useSessionStore'
import { GridLayer } from './GridLayer'
import { GeofenceLayer } from './GeofenceLayer'
import { NoGoZoneLayer } from './NoGoZoneLayer'
import { RouteLayer } from './RouteLayer'
import { DockMarker } from './DockMarker'
import { AnnotationLayer } from './AnnotationLayer'
import { RobotMarker } from './RobotMarker'
import { MapControls } from './MapControls'
import { FloorplanLayer } from './FloorplanLayer'
import { FloorPicker } from './FloorPicker'
import { CloudPanelOverlay, CloudToggle } from './CloudControls'
import { FitToSite, type FitPadding } from './FitToSite'
import { color } from '@/design-system/tokens'
import { boundsForFloor } from '@/liveops/mapFloor'
import type { Mission, RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

export const MAP_BOUNDS: L.LatLngBoundsLiteral = [[-40, -20], [40, 80]]

export { boundsForFloor }

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
 *
 * Given a surveyed `map`, the canvas takes its bounds from the chosen floor and
 * draws the floorplan under every other layer (full variant only: the mini
 * inset stays route + robot). With no map it is exactly the synthetic-grid
 * canvas it always was, which is what RunPage and SnapshotMap render. The floor
 * picker needs `onFloorChange` and more than one floor; pass a stable callback,
 * as this component re-renders on every telemetry frame.
 */
export function MapCanvas({
  robot, mission, variant = 'full', fitPadding, map, floorIndex, onFloorChange,
}: {
  robot: RobotState
  mission?: Mission
  variant?: 'full' | 'mini'
  /** Space to keep clear of floating panels when fitting the site. */
  fitPadding?: FitPadding
  /** The surveyed map to draw. Optional: without one the canvas is unchanged. */
  map?: SiteMap
  /** Which of the map's floors to show; defaults to its first. */
  floorIndex?: number
  onFloorChange?: (floorIndex: number) => void
}) {
  const isMini = variant === 'mini'
  const robots = useSiteRobots()
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const [layers, setLayers] = useState<MapLayerVisibility>(DEFAULT_LAYERS)
  // Closed by default. The handler is stable (the setter never changes) so the
  // memoized toggle and overlay skip the per-telemetry-frame re-render.
  const [cloudOpen, setCloudOpen] = useState(false)
  const toggleCloud = useCallback(() => setCloudOpen((o) => !o), [])

  // The surveyed map's own zones, or none to draw the mock site's (RunPage and
  // SnapshotMap pass no map). A map with no zones draws none: showing a mock
  // site's no-go areas over a real survey would be a safety overlay that is
  // confidently wrong. `map` keeps its identity between telemetry frames (see
  // useSiteMapStore), so `map.zones` does too, which the memoized layers need.
  const zones = map?.zones

  const floor = map?.floors.find((f) => f.index === (floorIndex ?? map.floors[0]?.index))
  // The inset takes a `map` for its zones only. It keeps the site bounds it has
  // always had, and draws no floorplan, picker or cloud toggle.
  const bounds = floor && !isMini ? boundsForFloor(floor) : MAP_BOUNDS

  const toggleLayer = (key: keyof MapLayerVisibility) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }))

  return (
    // `isolation` keeps Leaflet's panes (400+) and MapControls (1000) inside
    // the map, so panels the surrounding view floats over it — the manual
    // control panel spanning Split view's two panes — stay on top.
    <div style={{ position: 'relative', width: '100%', height: '100%', isolation: 'isolate' }}>
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
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
        <FitToSite floor={isMini ? undefined : floor} robot={robot} mission={mission} padding={isMini ? { topLeft: [8, 8], bottomRight: [8, 8] } : fitPadding ?? DEFAULT_FIT} />
        {!isMini && map && floor && <FloorplanLayer map={map} floorIndex={floor.index} />}
        <GridLayer bounds={GRID_BOUNDS} />
        {/* The site boundary shows in the mini inset too: without it a robot
            with no mission is a lone dot on an empty grid. */}
        {(isMini || layers.geofence) && <GeofenceLayer zones={zones} />}
        {!isMini && layers.noGoZones && <NoGoZoneLayer zones={zones} />}
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
            robot={robot} mission={mission} bounds={bounds}
            layers={layers} onToggleLayer={toggleLayer}
          />
        )}
        {!isMini && map && floor && (
          // Above MapControls' column (bottom-right), clear of its layers menu.
          <div style={{ position: 'absolute', bottom: 176, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {onFloorChange && map.floors.length > 1 && (
              <FloorPicker map={map} value={floor.index} onChange={onFloorChange} />
            )}
            <CloudToggle open={cloudOpen} onToggle={toggleCloud} />
          </div>
        )}
      </MapContainer>
      {/* A sibling of the Leaflet container, not a child: the panel's own drag
          and wheel zoom must not reach the map underneath. */}
      {!isMini && map && floor && <CloudPanelOverlay open={cloudOpen} map={map} floorIndex={floor.index} />}
    </div>
  )
}

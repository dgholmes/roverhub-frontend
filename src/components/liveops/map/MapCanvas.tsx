import { useSiteRobots } from '@/org/useSiteRobots'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { LiveScene } from './LiveScene'
import { MapViewSwitch, effectiveMapView, mapViewReasons, useMapViewPref } from './MapViewSwitch'
import { NavBar, NavGoalMarkers, NavMapInput, NavTools, useNavGoal } from './NavGoalLayer'
import { FitToSite, type FitPadding } from './FitToSite'
import { WalkableLayer } from './WalkableLayer'
import { ScanLayer } from './ScanLayer'
import { RobotBodyLayer } from './RobotBodyLayer'
import { useSurveyLayers } from '@/liveops/mapLayerPrefs'
import { useWalkableArea } from '@/liveops/useWalkableArea'
import { color } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { boundsForFloor } from '@/liveops/mapFloor'
import { useSceneData } from '@/scene3d/useSceneData'
import type { Mission, RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

export const MAP_BOUNDS: L.LatLngBoundsLiteral = [[-40, -20], [40, 80]]

export { boundsForFloor }

/** The grid extends well past the site so the canvas never ends in a hard
 * edge when the operator pans or the view is wider than the site. */
const GRID_BOUNDS: L.LatLngBoundsLiteral = [[-300, -300], [300, 300]]

const DEFAULT_FIT: FitPadding = { topLeft: [24, 24], bottomRight: [24, 24] }

/**
 * The element inside `wrap` that is fullscreen now (the scene's own Fullscreen
 * button), or null. The nav tools and bar are siblings of the map, so in that
 * state they would be off screen -- Stop included, while the robot walks --
 * and are portalled into it instead.
 */
function useFullscreenWithin(wrap: React.RefObject<HTMLElement | null>): Element | null {
  const [el, setEl] = useState<Element | null>(null)
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement
      setEl(fs && wrap.current && fs !== wrap.current && wrap.current.contains(fs) ? fs : null)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [wrap])
  return el
}

export interface MapLayerVisibility {
  geofence: boolean
  noGoZones: boolean
  annotations: boolean
  otherRobots: boolean
  /** Where the robot may walk, from the floor's planning grid. Remembered. */
  walkable: boolean
  /** The selected robot's live lidar scan. Remembered. */
  lidar: boolean
}

type SessionLayers = Omit<MapLayerVisibility, 'walkable' | 'lidar'>

const DEFAULT_LAYERS: SessionLayers = {
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
 *
 * On a surveyed floor the full map also has a view switch (MapViewSwitch):
 * Plan is this Leaflet map; 3D, Fly and Follow show the floor's 3D scene
 * (LiveScene) in its place, with the same goal, Set-position and tool bar
 * over it, so tap to walk works the same in every view.
 */
function MapCanvasPane({
  robot, mission, variant = 'full', fitPadding, map, floorIndex, onFloorChange, navToolsAt,
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
  /** Where the tap-to-go tool group sits, clear of what the view floats over
   * the map's top-left (MapFirstView's telemetry card, StackedView's label). */
  navToolsAt?: { top: number; left: number }
}) {
  const isMini = variant === 'mini'
  const robots = useSiteRobots()
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const [sessionLayers, setLayers] = useState<SessionLayers>(DEFAULT_LAYERS)
  const [surveyLayers, toggleSurveyLayer] = useSurveyLayers()
  const layers: MapLayerVisibility = { ...sessionLayers, ...surveyLayers }

  // The surveyed map's own zones. A map with no zones draws none: showing a
  // mock site's no-go areas over a real survey would be a safety overlay that
  // is confidently wrong. With no map at all the layers draw the provider's
  // sample site, which is the mock North Yard in mock mode and nothing on the
  // real backend, and so are the pins. `map` keeps its identity between
  // telemetry frames (see useSiteMapStore), and so does the sample site, so the
  // zones do too, which the memoized layers need.
  const zones = map?.zones
  const sample = dataProvider.sampleSite()
  const drawnZones = zones ?? sample.zones

  const floor = map?.floors.find((f) => f.index === (floorIndex ?? map.floors[0]?.index))
  // The inset takes a `map` for its zones only. It keeps the site bounds it has
  // always had, and draws no floorplan, picker or view switch.
  const bounds = floor && !isMini ? boundsForFloor(floor) : MAP_BOUNDS

  // Tap-to-go: the full map on a surveyed floor only. The inset and the
  // synthetic-grid canvases (RunPage, SnapshotMap) get none of it.
  const navOn = !isMini && !!map && !!floor
  // The scene's own controls laid clear of what the view floats over the map:
  // the telemetry card and camera dock (the room fitPadding keeps beyond the
  // default), the Go / Set position tools (navToolsAt, about 44 px tall) and
  // the Walk / Stop bar along the bottom.
  const padLeft = fitPadding?.topLeft[0], padRight = fitPadding?.bottomRight[0], toolsTop = navToolsAt?.top
  const sceneInsets = useMemo(() => ({
    left: Math.max(0, (padLeft ?? DEFAULT_FIT.topLeft[0]) - DEFAULT_FIT.topLeft[0]),
    right: Math.max(0, (padRight ?? DEFAULT_FIT.bottomRight[0]) - DEFAULT_FIT.bottomRight[0]),
    top: (toolsTop ?? 0) + 44,
    bottom: 64,
  }), [padLeft, padRight, toolsTop])
  // The floor's planning grid, analysed: drawn as the walkable layer, and used
  // to refuse taps Nav2 could not plan to -- the second whether or not the
  // layer is shown.
  const walkable = useWalkableArea(navOn ? map : undefined, navOn ? floor : undefined)
  const walkableAnalysis = walkable.state === 'ready' ? walkable.analysis : null
  const nav = useNavGoal(robot, navOn ? map : undefined, navOn ? floor : undefined, walkableAnalysis)

  // Plan, 3D, Fly or Follow: the flat map, or the floor's scene. A scene view
  // needs the scene built (Fly and Follow its cloud too); until then, or
  // without one, the map stays on Plan. The scene is the one FloorplanLayer
  // already loads (one cache), and nothing at all for the inset.
  const [chosenView, chooseView] = useMapViewPref()
  const scene = useSceneData(navOn ? map : undefined, floor?.index ?? 0)
  const reasons = useMemo(() => mapViewReasons(navOn ? scene : null), [navOn, scene])
  const view = effectiveMapView(chosenView, reasons)
  const sceneData = view !== 'plan' && scene.status === 'ready' ? scene.data : null
  const wrapRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreenWithin(wrapRef)

  const toggleLayer = (key: keyof MapLayerVisibility) => {
    if (key === 'walkable' || key === 'lidar') toggleSurveyLayer(key)
    else setLayers((l) => ({ ...l, [key]: !l[key] }))
  }

  return (
    // `isolation` keeps Leaflet's panes (400+) and MapControls (1000) inside
    // the map, so panels the surrounding view floats over it — the manual
    // control panel spanning Split view's two panes — stay on top.
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', isolation: 'isolate' }}>
      {sceneData && map && view !== 'plan' ? (
        <LiveScene
          data={sceneData} view={view} onViewChange={chooseView}
          robot={robot} mission={mission} mapId={map.map_id} zones={drawnZones}
          layers={layers} markers={nav.markers} input={nav.input} insets={sceneInsets}
        />
      ) : (
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
          <FitToSite floor={isMini ? undefined : floor} zones={zones} robot={robot} mission={mission} padding={isMini ? { topLeft: [8, 8], bottomRight: [8, 8] } : fitPadding ?? DEFAULT_FIT} />
          {!isMini && map && floor && <FloorplanLayer map={map} floorIndex={floor.index} walkable={walkable} />}
          {navOn && floor && layers.walkable && walkableAnalysis && <WalkableLayer analysis={walkableAnalysis} floor={floor} tightOnly={scene.status === 'ready'} />}
          <GridLayer bounds={GRID_BOUNDS} />
          {/* The site boundary shows in the mini inset too: without it a robot
              with no mission is a lone dot on an empty grid. */}
          {(isMini || layers.geofence) && <GeofenceLayer zones={drawnZones} />}
          {!isMini && layers.noGoZones && <NoGoZoneLayer zones={drawnZones} />}
          {mission && <RouteLayer mission={mission} />}
          {mission && <DockMarker coord={mission.dock_coord} />}
          {!isMini && layers.annotations && <AnnotationLayer annotations={sample.annotations} />}
          {!isMini && layers.otherRobots && robots
            .filter((r) => r.robot_id !== robot.robot_id)
            .map((r) => (
              <RobotMarker key={r.robot_id} robot={r} selected={false} onSelect={() => setSelectedRobot(r.robot_id)} />
            ))}
          {!isMini && <RobotBodyLayer robot={robot} />}
          {navOn && map && layers.lidar && <ScanLayer robotId={robot.robot_id} mapId={map.map_id} />}
          {navOn && <NavGoalMarkers {...nav.markers} />}
          <RobotMarker robot={robot} selected />
          {navOn && <NavMapInput {...nav.input} />}
          {!isMini && (
            <MapControls
              robot={robot} mission={mission} bounds={bounds}
              layers={layers} onToggleLayer={toggleLayer} surveyLayers={navOn}
            />
          )}
        </MapContainer>
      )}
      {navOn && map && floor && (
        // Above MapControls' column (bottom-right), clear of its layers menu,
        // and in the same place in every view. A sibling of the map, so a
        // press here is never also a tap on it.
        <div style={{ position: 'absolute', bottom: 176, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {onFloorChange && map.floors.length > 1 && (
            <FloorPicker map={map} value={floor.index} onChange={onFloorChange} />
          )}
          <MapViewSwitch value={view} onChange={chooseView} reasons={reasons} />
        </div>
      )}
      {/* Siblings too, so pressing Walk or Stop is never also a tap on the map;
          the same ones in every view. When the scene is fullscreen they go in
          with it, marked as the scene's UI so its pointer input ignores them. */}
      {navOn && (fullscreen
        ? createPortal(
          <div data-scene-ui style={{ display: 'contents' }}>
            <NavTools {...nav.tools} top={navToolsAt?.top} left={navToolsAt?.left} />
            <NavBar {...nav.bar} />
          </div>,
          fullscreen,
        )
        : <>
          <NavTools {...nav.tools} top={navToolsAt?.top} left={navToolsAt?.left} />
          <NavBar {...nav.bar} />
        </>)}
    </div>
  )
}

/** The map, behind its own error boundary: a fault in one of its layers takes
 * down this pane only, never the view around it or the command bar. A new
 * robot gets a fresh try. */
export function MapCanvas(props: React.ComponentProps<typeof MapCanvasPane>) {
  return (
    <ErrorBoundary area="map" variant="pane" resetKeys={[props.robot.robot_id]}>
      <MapCanvasPane {...props} />
    </ErrorBoundary>
  )
}

import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, useMap } from 'react-leaflet'
import L, { type LatLngBoundsLiteral } from 'leaflet'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { MapCaptionsProvider, captionColumnStyle } from '@/components/liveops/map/MapCaptions'
import { RobotMarker } from '@/components/liveops/map/RobotMarker'
import { ClassicRobotMarker } from '@/components/liveops/map/ClassicRobotMarker'
import { HomeMarker } from '@/components/liveops/map/HomeMarker'
import { NavGoalMarkers, NavMapInput } from '@/components/liveops/map/NavGoalLayer'
import { color, radius, space } from '@/design-system/tokens'
import { boundsForFloor } from '@/liveops/mapFloor'
import { contentBoundsM } from '@/liveops/contentBounds'
import { useSceneData } from '@/scene3d/useSceneData'
import { useRobotMarkerStyle } from '@/liveops/robotMarkerPref'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useSiteRobots } from '@/org/useSiteRobots'
import type { SiteMap } from '@/types/maps'
import { CloudEmptyState } from './CloudEmptyState'
import { MapSceneView } from './MapSceneView'
import { planViewHold, shownPlanView, type PlanView } from './planView'
import { robotOnFloor } from './robotMaps'
import { ZoneDrawLayers, type ZoneDraft } from './ZoneEditor'
import type { HomeDraft } from './HomeSection'

// three.js is most of a megabyte: loaded only when 3D is chosen, as LiveOps
// does (MapDetailPanel).
const CloudViewer3D = lazy(() => import('./CloudViewer3D').then((m) => ({ default: m.CloudViewer3D })))

// Kept here too: the page's tests and earlier callers import it from the plan.
export { robotOnFloor }

const NO_TAP = () => {}

/** Fits the view to the surveyed part of the floor once its grid is read: the
 *  floor's grid reaches far past the building (UnsurveyedLayer), and fitting
 *  to all of it drew the plan small in the middle of black. Once per floor, so
 *  it never undoes a pan or zoom. */
function FitToContent({ bounds }: { bounds: LatLngBoundsLiteral | null }) {
  const leaflet = useMap()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!bounds || done) return
    leaflet.fitBounds(bounds, { padding: [24, 24] })
    setDone(true)
  }, [leaflet, bounds, done])
  return null
}

/** The site's robots on this floor, at their live position. Its own component
 *  so that the LiveOps store's 5 Hz robot updates re-render only the markers,
 *  never the map or the page around it. */
const LiveRobots = memo(function LiveRobots({ map, floorIndex }: { map: SiteMap; floorIndex: number }) {
  const robots = useSiteRobots()
  const [markerStyle] = useRobotMarkerStyle()
  const Robot = markerStyle === 'classic' ? ClassicRobotMarker : RobotMarker
  return <>{robots.filter((r) => robotOnFloor(r, map, floorIndex)).map((r) => (
    <Robot key={r.robot_id} robot={r} selected={false} />
  ))}</>
})

/**
 * The Map workspace's centre: the floor plan with its zones and the robots
 * on it, filling the space it is given, in the view the page's header chose
 * (`view`): Flat, the 3D map scene, or the floor's point cloud (CloudViewer3D),
 * each loaded when asked for. The switch lives in the page header (operator,
 * 2026-11-26: floating it over the map pushed the scene's own controls half
 * way down), so the scene's controls sit at the map's top edge.
 *
 * Zones are drawn read-only unless `draft` is drawing (the Zones tab), when a
 * click places a corner and a double-click finishes, as in the zone editor.
 * The coverage note ("12% surveyed") is the floor plan's own caption.
 *
 * The floor's home (0.0.33) is drawn as a house with its heading. While the
 * Overview's Home section picks a new one (`home`), the plan stops panning and
 * a press, drag and release on it is the pose -- LiveOps' Set position
 * gesture, read by the same NavMapInput and drawn by the same NavGoalMarkers.
 */
export function MapPlanView({ map, floorIndex, view: chosen, draft, home }: {
  map: SiteMap
  floorIndex: number
  /** The view the header chose. Drawing a zone or picking a home shows Flat whatever it is. */
  view: PlanView
  /** The zones as the Zones tab holds them (with any unsaved edits), and the shape being drawn. */
  draft: Pick<ZoneDraft, 'zones' | 'drawing' | 'onVertex' | 'finish'>
  /** The home being picked (HomeSection's useHomeDraft); absent draws the home only. */
  home?: Pick<HomeDraft, 'picking' | 'pose' | 'onPress' | 'onDrag' | 'onRelease' | 'cancel'>
}) {
  const { t } = useTranslation()
  const picking = home?.picking === true
  // A zone or a home is placed on the plan: either brings the 2D view back.
  const view = shownPlanView(chosen, planViewHold(draft.drawing, picking))
  const [captionHost, setCaptionHost] = useState<HTMLDivElement | null>(null)
  const floor = map.floors.find((f) => f.index === floorIndex)
  const bounds = useMemo(() => (floor ? boundsForFloor(floor) : undefined), [floor])
  // The same read FloorplanLayer makes (cached per map version and floor).
  const scene = useSceneData(map, floorIndex)
  const grid = scene.status === 'ready' ? scene.data?.grid ?? null : null
  const content = useMemo(() => (grid ? contentBoundsM(grid) : null), [grid])
  // '' in mock mode: no cloud to fetch.
  const cloudUrl = floor ? dataProvider.mapArtifactUrl(map.map_id, floor.index, 'cloud') : ''

  return (
    <div data-map-plan="" style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 0,
      borderRadius: radius.md, overflow: 'hidden', background: color.mapBg,
    }}>
      {view === '2d' ? (
        <MapCaptionsProvider host={captionHost}>
          <MapContainer
            // A new floor or map is a new extent to fit.
            key={`${map.map_id}/${floorIndex}`}
            crs={L.CRS.Simple}
            bounds={bounds ?? [[-40, -20], [40, 80]]}
            style={{ height: '100%', width: '100%', background: color.mapBg, cursor: draft.drawing ? 'crosshair' : undefined }}
            zoomControl={false}
            attributionControl={false}
            // A double-click finishes a zone; it must not also zoom.
            doubleClickZoom={false}
            minZoom={1}
            maxZoom={7}
            zoomSnap={0.25}
            zoomDelta={0.5}
          >
            {floor && <FloorplanLayer map={map} floorIndex={floor.index} />}
            <ZoneDrawLayers draft={draft} />
            {floor?.home && !picking && <HomeMarker home={floor.home} />}
            {picking && home && (
              <>
                <NavGoalMarkers from={null} pending={null} pendingRefused={false} walking={null} pose={home.pose} />
                <NavMapInput
                  mode="setPosition" onTap={NO_TAP}
                  onPress={home.onPress} onDrag={home.onDrag} onRelease={home.onRelease} onEscape={home.cancel}
                />
              </>
            )}
            <LiveRobots map={map} floorIndex={floorIndex} />
            <FitToContent bounds={content} />
          </MapContainer>
          <div ref={setCaptionHost} style={captionColumnStyle} />
        </MapCaptionsProvider>
      ) : view === 'scene' ? (
        <div style={{ position: 'absolute', inset: 0 }}>
          {scene.status === 'ready' && scene.data ? (
            <MapSceneView data={scene.data} zones={draft.zones} frameKey={`${map.map_id}@${map.updated_at}/${floorIndex}`} />
          ) : <CloudEmptyState message={scene.status === 'loading' ? t('liveops.map.cloudLoading') : t('liveops.map.noCloud')} />}
        </div>
      ) : (
        <div style={{ position: 'absolute', inset: 0, padding: space[2] }}>
          {cloudUrl ? (
            <Suspense fallback={<CloudEmptyState message={t('liveops.map.cloudLoading')} />}>
              <CloudViewer3D url={cloudUrl} height="100%" />
            </Suspense>
          ) : <CloudEmptyState message={t('liveops.map.noCloud')} />}
        </div>
      )}
    </div>
  )
}

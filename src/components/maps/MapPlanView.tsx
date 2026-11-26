import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, useMap } from 'react-leaflet'
import L, { type LatLngBoundsLiteral } from 'leaflet'
import { Segmented } from '@/components/kit'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { MapCaptionsProvider, captionColumnStyle } from '@/components/liveops/map/MapCaptions'
import { RobotMarker } from '@/components/liveops/map/RobotMarker'
import { ClassicRobotMarker } from '@/components/liveops/map/ClassicRobotMarker'
import { color, radius, space } from '@/design-system/tokens'
import { boundsForFloor } from '@/liveops/mapFloor'
import { contentBoundsM } from '@/liveops/contentBounds'
import { useSceneData } from '@/scene3d/useSceneData'
import { useRobotMarkerStyle } from '@/liveops/robotMarkerPref'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useSiteRobots } from '@/org/useSiteRobots'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { CloudEmptyState } from './CloudEmptyState'
import { MapSceneView } from './MapSceneView'
import { ZoneDrawLayers, type ZoneDraft } from './ZoneEditor'

// three.js is most of a megabyte: loaded only when 3D is chosen, as LiveOps
// does (MapDetailPanel).
const CloudViewer3D = lazy(() => import('./CloudViewer3D').then((m) => ({ default: m.CloudViewer3D })))

/** Flat is the floor plan; 3D is the map scene (Plan / Fly, as in LiveOps);
 *  Point cloud is the plain white cloud (CloudViewer3D). */
type PlanView = '2d' | 'scene' | 'cloud'

/** Whether a robot's live position belongs on this floor of this map: its nav
 *  stack runs this map, its position is the nav stack's (AMCL's map pose, not
 *  odometry), and -- on a map with several floors -- the floor it runs is this
 *  one (its files hash to this floor's). */
export function robotOnFloor(robot: Pick<RobotState, 'bridge' | 'position'>, map: SiteMap, floorIndex: number): boolean {
  if (robot.bridge?.nav_map_id !== map.map_id) return false
  if (robot.position.provider !== 'slam' || robot.position.quality === 'lost') return false
  if (map.floors.length <= 1) return true
  const hash = map.floors.find((f) => f.index === floorIndex)?.content_hash
  return !!hash && robot.bridge?.nav_map_hash === hash
}

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
 * on it, filling the space it is given, with a 2D / 3D switch. 3D is the
 * floor's point cloud (CloudViewer3D), loaded when asked for.
 *
 * Zones are drawn read-only unless `draft` is drawing (the Zones tab), when a
 * click places a corner and a double-click finishes, as in the zone editor.
 * The coverage note ("12% surveyed") is the floor plan's own caption.
 */
export function MapPlanView({ map, floorIndex, draft }: {
  map: SiteMap
  floorIndex: number
  /** The zones as the Zones tab holds them (with any unsaved edits), and the shape being drawn. */
  draft: Pick<ZoneDraft, 'zones' | 'drawing' | 'onVertex' | 'finish'>
}) {
  const { t } = useTranslation()
  const [chosen, setView] = useState<PlanView>('2d')
  // A zone is drawn on the plan: drawing one brings the 2D view back.
  const view: PlanView = draft.drawing ? '2d' : chosen
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
            <LiveRobots map={map} floorIndex={floorIndex} />
            <FitToContent bounds={content} />
          </MapContainer>
          <div ref={setCaptionHost} style={captionColumnStyle} />
        </MapCaptionsProvider>
      ) : view === 'scene' ? (
        <div style={{ position: 'absolute', inset: 0 }}>
          {scene.status === 'ready' && scene.data ? (
            <MapSceneView
              data={scene.data} zones={draft.zones} frameKey={`${map.map_id}@${map.updated_at}/${floorIndex}`}
              insetTop={space[3] * 2 + 32}
            />
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
      <div style={{ position: 'absolute', top: space[3], right: space[3], zIndex: 1001 }}>
        <Segmented<PlanView>
          label={t('missions.maps.page.viewAria')} value={view} onChange={setView}
          options={[
            { value: '2d', label: t('missions.maps.page.view.flat') },
            { value: 'scene', label: t('missions.maps.page.view.scene') },
            { value: 'cloud', label: t('missions.maps.page.view.cloud') },
          ]}
        />
      </div>
    </div>
  )
}

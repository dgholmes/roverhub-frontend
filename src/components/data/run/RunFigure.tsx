import { Fragment, memo, useEffect, useMemo } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { toLatLng } from '@/liveops/mapCoords'
import { boundsForFloor } from '@/liveops/mapFloor'
import { useCursor, type RunCursor } from '@/data/runCursor'
import { figureBounds, firstPose, planIndexAt, positionAt, walkedRuns, walkedUpTo, type TrackModel, type XY } from '@/data/runTrack'
import type { MissionWaypoint, SiteMap, TracePlan } from '@/types'

export interface FigureLayers { route: boolean; plans: boolean; walked: boolean }

const latLngs = (runs: XY[][]) => runs.map((r) => r.map(([x, y]) => [y, x] as [number, number]))

/** Frames the figure once per `fitKey`, refits on resize until the user pans
 * or zooms, and always tells Leaflet its box changed (the camera swap resizes it). */
function FitTo({ bounds, fitKey, corner }: { bounds: L.LatLngBoundsLiteral; fitKey: string; corner: boolean }) {
  const map = useMap()
  useEffect(() => {
    let touched = false
    const mark = () => { touched = true }
    // Keep the walk out from under the camera in the bottom-right corner.
    const fit = () => {
      const w = map.getContainer().clientWidth
      map.fitBounds(bounds, { paddingTopLeft: [24, 48], paddingBottomRight: [corner ? Math.round(w * 0.34) + 36 : 24, 24], animate: false })
    }
    map.invalidateSize({ animate: false })
    fit()
    map.on('dragstart', mark)
    const el = map.getContainer()
    el.addEventListener('wheel', mark, { passive: true })
    const ro = new ResizeObserver(() => { map.invalidateSize({ animate: false }); if (!touched) fit() })
    ro.observe(el)
    return () => { map.off('dragstart', mark); el.removeEventListener('wheel', mark); ro.disconnect() }
    // `bounds` is read when fitting; `fitKey` says when it is a different question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, corner])
  return null
}

function numberIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9px;background:${color.amber};color:#000;font:600 10px/1 'Outfit',system-ui,sans-serif">${n}</span>`,
  })
}

/** The route as drawn: from where the robot started, through each waypoint,
 * dashed amber, with each waypoint's tolerance ring and its number. */
const RouteLayer = memo(function RouteLayer({ start, waypoints }: { start: XY | null; waypoints: MissionWaypoint[] }) {
  const line = [...(start ? [start] : []), ...waypoints.map((w) => [w.x_m, w.y_m] as XY)]
  return (
    <>
      {line.length > 1 && <Polyline positions={latLngs([line])} interactive={false} pathOptions={{ color: color.amber, weight: 2, opacity: 0.9, dashArray: '6 6' }} />}
      {waypoints.map((w, i) => (
        <Fragment key={w.waypoint_id}>
          <Circle center={toLatLng(w.x_m, w.y_m)} radius={w.tolerance_m} interactive={false}
            pathOptions={{ color: color.amber, weight: 1, opacity: 0.7, fillColor: color.amber, fillOpacity: 0.08 }} />
          <Marker position={toLatLng(w.x_m, w.y_m)} icon={numberIcon(i + 1)} interactive={false} keyboard={false} />
        </Fragment>
      ))}
    </>
  )
})

/** Every plan Nav2 made up to the cursor, thin green; the one it was
 * following at the cursor stronger. Re-renders only when that plan changes. */
const PlansLayer = memo(function PlansLayer({ plans, cursor }: { plans: TracePlan[]; cursor: RunCursor }) {
  const current = useCursor(cursor, (t) => planIndexAt(plans, t))
  return (
    <>
      {plans.slice(0, current + 1).map((p, i) => (
        <Polyline key={i} positions={latLngs([p.points])} interactive={false}
          pathOptions={i === current
            ? { color: color.green, weight: 3, opacity: 0.95 }
            : { color: color.green, weight: 1, opacity: 0.35, dashArray: p.failed ? '2 4' : undefined }} />
      ))}
    </>
  )
})

/** The walk up to the cursor, solid blue, and the robot there with its heading.
 * The one layer that redraws as the cursor moves (at the trace's 5 Hz). */
function CursorWalk({ model, cursor, walked }: { model: TrackModel; cursor: RunCursor; walked: boolean }) {
  const t = useCursor(cursor, (v) => Math.round(v * 5) / 5)
  const runs = useMemo(() => (walked ? latLngs(walkedUpTo(model, t)) : []), [model, t, walked])
  const here = positionAt(model, t)
  return (
    <>
      {runs.length > 0 && <Polyline positions={runs} interactive={false} pathOptions={{ color: color.blue, weight: 3, opacity: 0.95 }} />}
      {here && (
        <>
          <Polyline interactive={false} positions={[toLatLng(here.x, here.y), toLatLng(here.x + 0.8 * Math.cos(here.yaw), here.y + 0.8 * Math.sin(here.yaw))]}
            pathOptions={{ color: color.t1, weight: 3, opacity: 1 }} />
          <CircleMarker center={toLatLng(here.x, here.y)} radius={7} interactive={false}
            pathOptions={{ color: color.t1, weight: 2, fillColor: color.blue, fillOpacity: 1 }} />
        </>
      )}
    </>
  )
}

/**
 * The run's figure, as the backend draws it for the zip: the survey map,
 * the route as drawn, Nav2's plans and the walk (AMCL), with the robot at the
 * cursor. Static layers are memoized; only the plan in use and the walk to
 * the cursor follow it.
 */
export const RunFigure = memo(function RunFigure({ map, floorIndex, waypoints, model, plans, cursor, layers, fitKey, corner = false }: {
  /** The run's survey map; null draws the plain grid. */
  map: SiteMap | null
  floorIndex: number
  waypoints: MissionWaypoint[]
  model: TrackModel
  plans: TracePlan[]
  cursor: RunCursor
  layers: FigureLayers
  fitKey: string
  /** The camera sits in the bottom-right corner: frame the walk clear of it. */
  corner?: boolean
}) {
  const floor = map?.floors.find((f) => f.index === floorIndex) ?? map?.floors[0]
  const start = useMemo(() => { const p = firstPose(model); return p ? [p.x, p.y] as XY : null }, [model])
  const allWalked = useMemo(() => latLngs(walkedRuns(model)), [model])
  const bounds = useMemo<L.LatLngBoundsLiteral>(
    () => figureBounds(model, plans, waypoints) ?? (floor ? boundsForFloor(floor) : MAP_BOUNDS),
    [model, plans, waypoints, floor],
  )
  return (
    <MapContainer crs={L.CRS.Simple} bounds={bounds} style={{ height: '100%', width: '100%', background: color.mapBg }}
      zoomControl={false} attributionControl={false} minZoom={-2} maxZoom={8} zoomSnap={0.25}>
      <FitTo bounds={bounds} fitKey={`${fitKey}:${map?.map_id ?? 'grid'}`} corner={corner} />
      {map && floor
        ? <FloorplanLayer map={map} floorIndex={floor.index} captions={false} />
        : <GridLayer bounds={MAP_BOUNDS} />}
      {layers.route && <RouteLayer start={start} waypoints={waypoints} />}
      {layers.plans && <PlansLayer plans={plans} cursor={cursor} />}
      {layers.walked && allWalked.length > 0 && (
        <Polyline positions={allWalked} interactive={false} pathOptions={{ color: color.blue, weight: 2, opacity: 0.25 }} />
      )}
      <CursorWalk model={model} cursor={cursor} walked={layers.walked} />
    </MapContainer>
  )
})

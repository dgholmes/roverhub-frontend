import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { MapSceneLazy } from '@/components/scene/MapSceneLazy'
import type { SceneData, SceneRouteWaypoint, SceneView, SceneZone } from '@/scene3d/types'
import type { MissionWaypoint } from '@/types'
import type { MapZone } from '@/types/maps'

/** The views the route editor offers, in order (the prototype's three). */
const VIEWS: SceneView[] = ['plan', 'fly', 'follow']
/** Per browser, not per mission: the view an operator last drew or looked in. */
export const ROUTE_SCENE_VIEW_KEY = 'rh.missions.sceneView'

/** The stored view, or Plan for anything else: nothing stored, a value from an
 * older build, or storage that cannot be read (private window, blocked site
 * data, no `localStorage` at all). */
export function readStoredView(): SceneView {
  try {
    const v = globalThis.localStorage?.getItem(ROUTE_SCENE_VIEW_KEY)
    return v === 'fly' || v === 'follow' || v === 'plan' ? v : 'plan'
  } catch {
    return 'plan'
  }
}

function storeView(v: SceneView): void {
  try { globalThis.localStorage?.setItem(ROUTE_SCENE_VIEW_KEY, v) } catch { /* a per-viewer convenience only */ }
}

/** A mission's waypoints in the scene's shape, with the editor's merged flags
 * and notes. Exported for the test. */
export function sceneRoute(
  waypoints: readonly MissionWaypoint[],
  flags: Readonly<Record<string, 'error' | 'warning'>>,
  notes: Readonly<Record<string, string>>,
): SceneRouteWaypoint[] {
  return waypoints.map((wp) => ({
    id: wp.waypoint_id, x: wp.x_m, y: wp.y_m, label: wp.label,
    ...(flags[wp.waypoint_id] ? { flag: flags[wp.waypoint_id] } : null),
    ...(notes[wp.waypoint_id] ? { note: notes[wp.waypoint_id] } : null),
  }))
}

export function sceneZones(zones: readonly MapZone[]): SceneZone[] {
  return zones.map((z) => ({ id: z.zone_id, kind: z.kind, points: z.polygon.map(([x, y]) => [x, y] as [number, number]), label: z.label }))
}

/**
 * The route editor on the map scene: Plan to draw on (tilt for 3D), Fly to
 * look the drawn route over, and Follow's drivable stand-in, whose Space drops
 * a waypoint where it stands and whose Preview walks the route
 * (docs/superpowers/specs/2026-11-12-map-scene-plan-fly-follow-design.md).
 *
 * A tap on the floor, a dropped stand-in waypoint and a Leaflet click all go
 * through the same `place`, so a waypoint lands on the same map metres, with
 * the same floor z, whichever view it came from.
 */
export function RouteScene({
  data, zones, waypoints, flags, notes, selectedId, onSelect, place, frameKey, overlay,
}: {
  data: SceneData
  zones: readonly MapZone[]
  waypoints: readonly MissionWaypoint[]
  flags: Readonly<Record<string, 'error' | 'warning'>>
  notes: Readonly<Record<string, string>>
  selectedId: string | null
  onSelect: (id: string) => void
  place: (x_m: number, y_m: number) => void
  /** Changes when a different mission opens, so the scene re-frames to its route. */
  frameKey: string
  /** The floor picker and the off-free caption, laid in the scene's host slot. */
  overlay?: ReactNode
}) {
  const [view, setView] = useState<SceneView>(readStoredView)
  const onViewChange = useCallback((v: SceneView) => { setView(v); storeView(v) }, [])

  // A new identity rebuilds the overlay in the scene, so these change only
  // when their content can have.
  const route = useMemo(() => sceneRoute(waypoints, flags, notes), [waypoints, flags, notes])
  const sceneZoneList = useMemo(() => sceneZones(zones), [zones])

  return (
    <MapSceneLazy
      data={data}
      views={VIEWS}
      view={view}
      onViewChange={onViewChange}
      followTarget="standin"
      pointerMode="tap"
      route={route}
      selectedWaypointId={selectedId}
      zones={sceneZoneList}
      onFloorTap={place}
      onWaypointClick={onSelect}
      onStandinWaypoint={place}
      frameKey={frameKey}
      overlay={overlay}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

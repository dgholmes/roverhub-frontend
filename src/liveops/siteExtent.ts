import type { LatLngBoundsLiteral, LatLngTuple } from 'leaflet'
import { boundsForFloor } from '@/liveops/mapFloor'
import type { Mission, RobotState } from '@/types'
import type { MapFloor, MapZone } from '@/types/maps'

/**
 * Metres of context to frame around the robot when nothing on the canvas
 * gives a boundary: no surveyed floor, and no drawn geofence.
 *
 * Not a boundary: nothing draws it, and it claims nothing about where the site
 * ends. It exists because fitting a single point zooms Leaflet to its maximum,
 * and the operator needs some grid around the robot to read the view.
 */
export const NO_MAP_MARGIN_M = 20

/** The points the map's initial view should contain, as `[y, x]` metres: the
 * site boundary, the mission route and the robot.
 *
 * The site boundary is whatever the canvas draws, and only that: a surveyed
 * floor's surveyed extent plus the `geofence` zones it is given. Callers pass
 * the zones they draw -- a survey's, or the provider's sample site, which is
 * the demo perimeter in mock mode and nothing on the real backend. It
 * substitutes rather than adds, because fitting a perimeter that is not drawn
 * leaves a real 20 x 24 m floorplan as a patch on an empty canvas.
 *
 * ⚠️ `content` is the floor's SURVEYED extent and replaces its grid corners
 * when given. The two are not the same box: a floor's grid is sized from the
 * whole registered cloud, so a few returns through a window stretch it far
 * past anything the lidar classified. On the active map, 71% of the 58 x 25 m
 * rectangle holds no surveyed cell at all and every one of them sits in the
 * right-hand third, so fitting the grid drew a real 19 x 22 m office as a
 * patch against the pane's edge (user, 2026-11-25). The painted floorplan had
 * always cropped itself to the content; only this was still framing the
 * rectangle. See liveops/contentBounds for the measurements and for why Trim
 * is not a substitute.
 *
 * It arrives with the floor's grid, one paint after the map, so `null` is the
 * ordinary state on first render and must behave exactly as before.
 *
 * ⚠️ With no floor this used to import the mock perimeter from src/mocks and
 * fit it unconditionally. On the real backend, where the canvas draws no sample
 * site, LiveOps' opening view was framed on a boundary nothing showed, at
 * coordinates belonging to nowhere. With nothing drawn it now frames the robot.
 * Audit 2026-11-18 §8.6.
 *
 * Kept free of Leaflet's runtime so it can be tested. */
export function sitePoints(
  robot: RobotState, mission?: Mission, floor?: MapFloor, zones?: readonly MapZone[],
  content?: LatLngBoundsLiteral | null,
): LatLngTuple[] {
  const { x_m, y_m } = robot.position
  const fence: LatLngTuple[] = (zones ?? []).filter((z) => z.kind === 'geofence')
    .flatMap((z) => z.polygon.map(([x, y]): LatLngTuple => [y, x]))
  const floorExtent: LatLngTuple[] | null = floor
    ? ((content ?? boundsForFloor(floor)) as LatLngTuple[])
    : null
  const boundary: LatLngTuple[] = floorExtent
    ? [...floorExtent, ...fence]
    : fence.length > 0
      ? fence
      : [
          [y_m - NO_MAP_MARGIN_M, x_m - NO_MAP_MARGIN_M],
          [y_m + NO_MAP_MARGIN_M, x_m + NO_MAP_MARGIN_M],
        ]
  return [
    ...boundary,
    ...(mission?.waypoints ?? []).map((wp): LatLngTuple => [wp.y_m, wp.x_m]),
    [y_m, x_m],
  ]
}

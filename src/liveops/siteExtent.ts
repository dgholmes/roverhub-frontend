import type { LatLngTuple } from 'leaflet'
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
 * floor's grid corners plus the `geofence` zones it is given. Callers pass the
 * zones they draw -- a survey's, or the provider's sample site, which is the
 * demo perimeter in mock mode and nothing on the real backend. It substitutes
 * rather than adds, because fitting a perimeter that is not drawn leaves a real
 * 20 x 24 m floorplan as a patch on an empty canvas.
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
): LatLngTuple[] {
  const { x_m, y_m } = robot.position
  const fence: LatLngTuple[] = (zones ?? []).filter((z) => z.kind === 'geofence')
    .flatMap((z) => z.polygon.map(([x, y]): LatLngTuple => [y, x]))
  const boundary: LatLngTuple[] = floor
    ? [...(boundsForFloor(floor) as LatLngTuple[]), ...fence]
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

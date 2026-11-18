import type { LatLngTuple } from 'leaflet'
import { boundsForFloor } from '@/liveops/mapFloor'
import type { Mission, RobotState } from '@/types'
import type { MapFloor, MapZone } from '@/types/maps'

/**
 * Metres of context to frame around the robot when there is no surveyed floor.
 *
 * Not a boundary: nothing draws it, and it claims nothing about where the site
 * ends. It exists because fitting a single point zooms Leaflet to its maximum,
 * and the operator needs some grid around the robot to read the view.
 */
export const NO_MAP_MARGIN_M = 20

/** The points the map's initial view should contain, as `[y, x]` metres: the
 * site boundary, the mission route and the robot. The site boundary is what the
 * canvas draws: a surveyed floor's grid corners plus the loaded map's own
 * `geofence` zones. It substitutes rather than adds, because fitting a
 * perimeter that is not drawn leaves a real 20 x 24 m floorplan as a patch on
 * an empty canvas.
 *
 * ⚠️ With no floor there is no boundary, and this frames the robot instead. It
 * used to substitute the mock site's 65 x 40 m perimeter, which put the
 * operator's opening view at coordinates belonging to nowhere, with nothing to
 * say the empty space around the robot was demo geometry rather than real
 * site. Audit 2026-11-18 §8.6.
 *
 * Kept free of Leaflet's runtime so it can be tested. */
export function sitePoints(
  robot: RobotState, mission?: Mission, floor?: MapFloor, zones?: readonly MapZone[],
): LatLngTuple[] {
  const { x_m, y_m } = robot.position
  const boundary: LatLngTuple[] = floor
    ? [
        ...(boundsForFloor(floor) as LatLngTuple[]),
        ...(zones ?? []).filter((z) => z.kind === 'geofence')
          .flatMap((z) => z.polygon.map(([x, y]): LatLngTuple => [y, x])),
      ]
    : [
        [y_m - NO_MAP_MARGIN_M, x_m - NO_MAP_MARGIN_M],
        [y_m + NO_MAP_MARGIN_M, x_m + NO_MAP_MARGIN_M],
      ]
  return [
    ...boundary,
    ...(mission?.waypoints ?? []).map((wp): LatLngTuple => [wp.y_m, wp.x_m]),
    [robot.position.y_m, robot.position.x_m],
  ]
}

import type { LatLngTuple } from 'leaflet'
import { geofence } from '@/mocks/mockGeoZones'
import { boundsForFloor } from '@/liveops/mapFloor'
import type { Mission, RobotState } from '@/types'
import type { MapFloor, MapZone } from '@/types/maps'

/** The points the map's initial view should contain, as `[y, x]` metres: the
 * site boundary, the mission route and the robot. The site boundary is what the
 * canvas draws: a surveyed floor's grid corners plus the loaded map's own
 * `geofence` zones when a floor is shown, else the mock perimeter. It
 * substitutes rather than adds, because fitting a perimeter that is not drawn
 * (the mock's 65 x 40 m) leaves a real 20 x 24 m floorplan as a patch on an
 * empty canvas. With no floor this is exactly what FitToSite always fitted.
 * Kept free of Leaflet's runtime so it can be tested. */
export function sitePoints(
  robot: RobotState, mission?: Mission, floor?: MapFloor, zones?: readonly MapZone[],
): LatLngTuple[] {
  const boundary: LatLngTuple[] = floor
    ? [
        ...(boundsForFloor(floor) as LatLngTuple[]),
        ...(zones ?? []).filter((z) => z.kind === 'geofence')
          .flatMap((z) => z.polygon.map(([x, y]): LatLngTuple => [y, x])),
      ]
    : geofence.map((p): LatLngTuple => [p.y_m, p.x_m])
  return [
    ...boundary,
    ...(mission?.waypoints ?? []).map((wp): LatLngTuple => [wp.y_m, wp.x_m]),
    [robot.position.y_m, robot.position.x_m],
  ]
}

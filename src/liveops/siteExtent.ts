import type { LatLngTuple } from 'leaflet'
import { geofence } from '@/mocks/mockGeoZones'
import { boundsForFloor } from '@/liveops/mapFloor'
import type { Mission, RobotState } from '@/types'
import type { MapFloor } from '@/types/maps'

/** The points the map's initial view should contain, as `[y, x]` metres: the
 * site boundary, the mission route, the robot and -- when a surveyed floor is
 * shown -- both corners of its grid. Without the floor an operator opens on
 * empty ground and has to hunt for the floorplan; with none given this is
 * exactly what FitToSite always fitted. Kept free of Leaflet's runtime so it
 * can be tested. */
export function sitePoints(robot: RobotState, mission?: Mission, floor?: MapFloor): LatLngTuple[] {
  const points: LatLngTuple[] = [
    ...geofence.map((p): LatLngTuple => [p.y_m, p.x_m]),
    ...(mission?.waypoints ?? []).map((wp): LatLngTuple => [wp.y_m, wp.x_m]),
    [robot.position.y_m, robot.position.x_m],
  ]
  if (floor) points.push(...(boundsForFloor(floor) as LatLngTuple[]))
  return points
}

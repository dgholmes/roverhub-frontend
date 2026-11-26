import L from 'leaflet'
import { sitePoints } from '@/liveops/siteExtent'
import type { Mission, RobotState } from '@/types'
import type { MapFloor, MapZone } from '@/types/maps'

export interface FitPadding {
  /** Pixels kept clear on each side — room for panels floating over the map. */
  topLeft: [number, number]
  bottomRight: [number, number]
}

/** The extent worth looking at: the site boundary, the mission route, the
 * robot and, when a map is shown, the part of its floor that was actually
 * surveyed. What MapControls' Fit frames when there is no route -- the
 * overview an operator asks for, rather than the floor's whole grid rectangle,
 * 71% of which held no surveyed cell on the active map.
 *
 * ⚠️ No LiveOps map opens on this any more (2026-11-25). Every one opens
 * zoomed in on the robot and follows it (`FollowRobot`, rules in
 * `liveops/mapFollow.ts`); the component that used to fit the site on open
 * and on every resize was removed with that change. */
export function siteBounds(
  robot: RobotState, mission?: Mission, floor?: MapFloor, zones?: readonly MapZone[],
  content?: L.LatLngBoundsLiteral | null,
): L.LatLngBounds {
  return L.latLngBounds(sitePoints(robot, mission, floor, zones, content))
}

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { toLatLng } from '@/liveops/mapCoords'
import { geofence } from '@/mocks/mockGeoZones'
import type { Mission, RobotState } from '@/types'

export interface FitPadding {
  /** Pixels kept clear on each side — room for panels floating over the map. */
  topLeft: [number, number]
  bottomRight: [number, number]
}

/** The extent worth looking at: the site boundary, the mission route and the
 * robot. Fitting to these (rather than to the fixed MAP_BOUNDS envelope) is
 * what makes the site fill the canvas instead of sitting small in the middle. */
export function siteBounds(robot: RobotState, mission?: Mission): L.LatLngBounds {
  const points = [
    ...geofence.map((p) => toLatLng(p.x_m, p.y_m)),
    ...(mission?.waypoints ?? []).map((wp) => toLatLng(wp.x_m, wp.y_m)),
    toLatLng(robot.position.x_m, robot.position.y_m),
  ]
  return L.latLngBounds(points as L.LatLngExpression[])
}

/** Fits the view to the site once per selected robot — not on every telemetry
 * frame, which would yank the map away from wherever the operator panned it. */
export function FitToSite({ robot, mission, padding }: { robot: RobotState; mission?: Mission; padding: FitPadding }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(siteBounds(robot, mission), {
      paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight, animate: false,
    })
    // Deliberately keyed on the robot's identity only — see the doc comment.
  }, [map, robot.robot_id])
  return null
}

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
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
 * robot and, when a map is shown, its floor. Fitting to these (rather than to
 * the fixed MAP_BOUNDS envelope) is what makes the site fill the canvas
 * instead of sitting small in the middle. */
export function siteBounds(robot: RobotState, mission?: Mission, floor?: MapFloor, zones?: readonly MapZone[]): L.LatLngBounds {
  return L.latLngBounds(sitePoints(robot, mission, floor, zones))
}

/** Fits the view to the site once per selected robot — not on every telemetry
 * frame, which would yank the map away from wherever the operator panned it.
 * Also refits when the floor shown changes (the map arrives after the first
 * paint, and the picker switches floors); `floor` keeps its identity between
 * frames, so that is not per-frame either. */
export function FitToSite({ robot, mission, padding, floor, zones }: {
  robot: RobotState; mission?: Mission; padding: FitPadding; floor?: MapFloor
  /** The map's zones, whose geofence ones are fitted with the floor. Read when fitting, not a refit trigger. */
  zones?: readonly MapZone[]
}) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(siteBounds(robot, mission, floor, zones), {
      paddingTopLeft: padding.topLeft, paddingBottomRight: padding.bottomRight, animate: false,
    })
    // Deliberately keyed on the robot's identity only — see the doc comment.
  }, [map, robot.robot_id, floor])
  return null
}

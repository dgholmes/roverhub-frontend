import { useMemo } from 'react'
import { Polygon } from 'react-leaflet'
import { toLatLng } from '@/liveops/mapCoords'
import { robotBodyCorners } from '@/liveops/robotBody'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { RobotState } from '@/types'

/**
 * The selected robot as its real body: a 0.65 x 0.35 m rectangle centred on its
 * position and turned to its heading, drawn in map metres so it scales with the
 * zoom. Beside the marker (which stays a fixed size to be found at any zoom),
 * this is what shows whether the robot fits where it is going -- the walkable
 * layer's amber is free floor too close to something for this body to fit.
 *
 * Dashed when the position is not live, like the marker.
 */
export function RobotBodyLayer({ robot }: { robot: RobotState }) {
  // Wire data: a robot that has not reported a position draws no body.
  const { x_m, y_m, heading_deg, freshness } = robot.position ?? {}
  const drawable = [x_m, y_m, heading_deg].every((n) => typeof n === 'number' && Number.isFinite(n))
  const positions = useMemo(
    () => (drawable ? robotBodyCorners(x_m!, y_m!, heading_deg!).map(([x, y]) => toLatLng(x, y)) : []),
    [drawable, x_m, y_m, heading_deg],
  )
  if (!drawable) return null
  const tone = stateVisualFor(robot.abstract_state, robot.sdk_state).color
  const live = freshness === 'live'
  return (
    <Polygon
      positions={positions}
      interactive={false}
      pathOptions={{
        color: tone, weight: 1.5, opacity: live ? 0.9 : 0.5,
        fillColor: tone, fillOpacity: live ? 0.18 : 0.08,
        dashArray: live ? undefined : '4 3',
      }}
    />
  )
}

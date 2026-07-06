import type { Mission, RobotState } from '@/types'

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

export function compassLabel(deg: number): string {
  return COMPASS[Math.round((deg % 360) / 22.5) % 16]
}

/** Distance/bearing from the robot's current (estimated) position to the
 * active or next pending waypoint — computed live, not mocked as static text. */
export function nextWaypointInfo(
  robot: RobotState,
  mission?: Mission,
): { distance_m: number; bearing_deg: number; compass: string; label: string } | null {
  if (!mission) return null
  const target = mission.waypoints.find((wp) => wp.status === 'active') ?? mission.waypoints.find((wp) => wp.status === 'pending')
  if (!target) return null

  const dx = target.x_m - robot.position.x_m
  const dy = target.y_m - robot.position.y_m
  const distance_m = Math.sqrt(dx * dx + dy * dy)
  const bearing_deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

  return { distance_m, bearing_deg, compass: compassLabel(bearing_deg), label: target.label }
}

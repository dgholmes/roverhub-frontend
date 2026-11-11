/**
 * What a waypoint's heading means, in one place.
 *
 * `MissionWaypoint.heading_deg` is the editor's "Face (°)" field (StepInspector):
 * a compass bearing on the map, 0 facing up the map (+y, "north") and 90
 * facing right (+x), turning clockwise -- the same compass the editor's
 * bearings use (liveops/waypointGeometry.ts) and what the field's hint says.
 * Null is "any direction on arrival".
 *
 * A robot's pose is the other way round: yaw in radians ANTICLOCKWISE from +x
 * (NavGotoParams.yaw_rad, RobotPosition.heading_deg). So the direction drawn is
 * the direction faced only through this conversion, which the backend's route
 * compiler (roverhub-backend missions/route_steps.py) makes the same way:
 *
 *   heading 90  -> yaw 0    (faces +x)
 *   heading 0   -> yaw π/2  (faces +y)
 *
 * heading.test.ts pins both, and the backend pins the same two.
 */
export function waypointHeadingToYawRad(heading_deg: number | null): number | null {
  if (heading_deg === null || !Number.isFinite(heading_deg)) return null
  const yaw = ((90 - heading_deg) * Math.PI) / 180
  // Into (-π, π], as Nav2 and the bridge expect.
  return Math.atan2(Math.sin(yaw), Math.cos(yaw))
}

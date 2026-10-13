/**
 * Compass heading from the body yaw that every telemetry frame carries.
 *
 * `ori_body` is (roll, pitch, yaw) in radians (PRD §17.2). The bridge's
 * position_provider.py derives heading exactly this way —
 * `math.degrees(frame.ori_body[2]) % 360.0` — so the browser does the same
 * rather than inventing a second convention. Before this, heading was
 * hardcoded to 0 for every real robot, so the map arrow and Fleet both showed
 * due east whatever the robot was doing.
 */
export function headingFromYaw(yawRad: number): number {
  if (!Number.isFinite(yawRad)) return 0
  const deg = (yawRad * 180) / Math.PI
  // JS % keeps the sign of the dividend; Python's does not. Normalise so a
  // negative yaw gives the same 0–360 answer the bridge computes.
  return ((deg % 360) + 360) % 360
}

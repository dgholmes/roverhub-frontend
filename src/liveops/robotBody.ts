import type { Point2D } from '@/types/maps'

/** The X1's body footprint, metres: nose to tail, and side to side. */
export const ROBOT_BODY_LENGTH_M = 0.65
export const ROBOT_BODY_WIDTH_M = 0.35

/**
 * The four corners of the robot's body on the map: a `length` x `width`
 * rectangle centred on (x, y), its long side along the heading. `heading_deg`
 * is body yaw, anticlockwise from +x (as RobotPosition carries it), so at 0 the
 * body lies along +x and at 90 along +y. Map-frame metres, in order round the
 * rectangle starting front-left.
 */
export function robotBodyCorners(
  x_m: number, y_m: number, heading_deg: number,
  length_m = ROBOT_BODY_LENGTH_M, width_m = ROBOT_BODY_WIDTH_M,
): Point2D[] {
  const yaw = (heading_deg * Math.PI) / 180
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const hl = length_m / 2, hw = width_m / 2
  // Body frame: +x forward, +y left.
  const local: Point2D[] = [[hl, hw], [-hl, hw], [-hl, -hw], [hl, -hw]]
  return local.map(([bx, by]) => [x_m + bx * c - by * s, y_m + bx * s + by * c])
}

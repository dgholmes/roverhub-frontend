import { describe, expect, it } from 'vitest'
import { waypointHeadingToYawRad } from './heading'

/**
 * The direction a waypoint's "Face (°)" means, pinned so the backend's route
 * compiler (roverhub-backend missions/route_steps.py) converts it the same way:
 * the direction the editor means is the direction the robot faces on arrival.
 * The backend pins the same two cases.
 */
describe('waypointHeadingToYawRad', () => {
  it('turns 90° (faces right on the map, along +x) into yaw 0', () => {
    expect(waypointHeadingToYawRad(90)).toBeCloseTo(0, 12)
  })

  it('turns 0° (faces up the map, along +y) into yaw π/2', () => {
    expect(waypointHeadingToYawRad(0)).toBeCloseTo(Math.PI / 2, 12)
  })

  it('keeps "any direction" as no yaw', () => {
    expect(waypointHeadingToYawRad(null)).toBeNull()
  })

  it('agrees with the compass the editor uses for bearings (clockwise from up)', () => {
    // 180° faces down the map (-y); 270° faces left (-x). Yaw is wrapped to (-π, π].
    expect(Math.cos(waypointHeadingToYawRad(180)!)).toBeCloseTo(0, 12)
    expect(Math.sin(waypointHeadingToYawRad(180)!)).toBeCloseTo(-1, 12)
    expect(Math.cos(waypointHeadingToYawRad(270)!)).toBeCloseTo(-1, 12)
  })
})

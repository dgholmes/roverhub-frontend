import { describe, expect, it } from 'vitest'
import { markerRotationDeg } from './mapCoords'

// The marker's arrow is drawn pointing up (+y) and CSS rotate() turns it
// clockwise. heading_deg is the body yaw: anticlockwise from +x, as the
// bridge's position_provider and the mock's dead reckoning both use it.
const normalise = (deg: number) => ((deg % 360) + 360) % 360

describe('markerRotationDeg', () => {
  it('points a robot facing +x to the right, not up', () => {
    expect(normalise(markerRotationDeg(0))).toBe(90)
  })

  it('points a robot facing +y up', () => {
    expect(normalise(markerRotationDeg(90))).toBe(0)
  })

  it('points a robot facing -x to the left', () => {
    expect(normalise(markerRotationDeg(180))).toBe(270)
  })

  it('turns the arrow anticlockwise on screen when the robot turns left', () => {
    // A left turn raises yaw; clockwise CSS rotation must fall.
    expect(markerRotationDeg(30)).toBeLessThan(markerRotationDeg(0))
  })
})

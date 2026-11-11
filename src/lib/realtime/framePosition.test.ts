import { describe, expect, it } from 'vitest'
import { positionFromFrame, type FramePositionInput } from './framePosition'

const base: FramePositionInput = {
  pos_body: [-0.95, -3.6, 0.43],
  ori_body: [0, 0, Math.PI / 2],
  grpc_freshness: 'live',
  captured_at: '2026-11-10T08:00:00Z',
}

const amcl = {
  x_m: -0.94, y_m: -3.7, z_m: 0, heading_deg: 66.3, provider: 'slam',
  quality: 'localized', accuracy_m: 0.47, freshness: 'live', updated_at: '2026-11-10T08:00:01Z',
}

describe('positionFromFrame', () => {
  it("uses the bridge's position when the frame carries one", () => {
    // 2026-11-10: AMCL's map pose never reached the console; the marker was raw
    // odometry labelled dead_reckoning, and tap-to-walk refused every goal.
    const p = positionFromFrame({ ...base, position: amcl }, undefined)
    expect(p).toEqual(amcl)
  })

  it('falls back to raw odometry for a bridge that sends no position', () => {
    const p = positionFromFrame(base, undefined)
    expect(p.x_m).toBe(-0.95)
    expect(p.y_m).toBe(-3.6)
    expect(p.heading_deg).toBeCloseTo(90)
    expect(p.provider).toBe('dead_reckoning')
    expect(p.quality).toBe('estimated')
    expect(p.accuracy_m).toBeNull()
  })

  it('treats a malformed position as absent, never trusting it', () => {
    // It arrives over MQTT unvalidated; a bad one must not put the robot at NaN
    // or label an odometry position as on the map.
    for (const bad of [
      { ...amcl, x_m: Number.NaN },
      { ...amcl, provider: 'lidar' },
      { ...amcl, quality: 'great' },
      { ...amcl, heading_deg: 'north' },
      null,
      'here',
    ]) {
      const p = positionFromFrame({ ...base, position: bad }, undefined)
      expect(p.provider).toBe('dead_reckoning')
      expect(p.x_m).toBe(-0.95)
    }
  })

  it("keeps the last heading when an older bridge's frame has no ori_body", () => {
    const { ori_body: _, ...noOri } = base
    const p = positionFromFrame(noOri, 123)
    expect(p.heading_deg).toBe(123)
  })
})

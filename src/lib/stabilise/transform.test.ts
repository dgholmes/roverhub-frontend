import { describe, expect, it } from 'vitest'
import { applyAffine, correctionMatrix } from './transform'

describe('correctionMatrix', () => {
  it('only zooms about the centre when there is nothing to correct', () => {
    const m = correctionMatrix({ dx: 0, dy: 0, da: 0 }, 1280, 720, 0.08)
    expect(applyAffine(m, 640, 360)).toEqual({ x: 640, y: 360 })
    expect(applyAffine(m, 0, 0).x).toBeCloseTo(640 - 640 / 0.92, 6)
  })

  it('moves the picture by the correction, scaled to frame pixels', () => {
    const m = correctionMatrix({ dx: 2, dy: -1, da: 0 }, 1280, 720, 0, 4)
    expect(applyAffine(m, 100, 100)).toEqual({ x: 108, y: 96 })
  })

  it('cancels a roll: a correction of -da undoes a picture rolled by +da', () => {
    // A picture rolled by +da puts scene point s at R(da)(s - c) + c.
    const da = 0.05, cx = 640, cy = 360
    const s = { x: 900, y: 200 }
    const rolled = {
      x: cx + Math.cos(da) * (s.x - cx) - Math.sin(da) * (s.y - cy),
      y: cy + Math.sin(da) * (s.x - cx) + Math.cos(da) * (s.y - cy),
    }
    const back = applyAffine(correctionMatrix({ dx: 0, dy: 0, da: -da }, 1280, 720, 0), rolled.x, rolled.y)
    expect(back.x).toBeCloseTo(s.x, 6)
    expect(back.y).toBeCloseTo(s.y, 6)
  })
})

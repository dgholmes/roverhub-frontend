import { describe, expect, it } from 'vitest'
import { clampPadding } from './fitPadding'
import type { FitPadding } from '@/components/liveops/map/FitToSite'

// MapFirstView's real declaration: 300 px is the telemetry card, DOCK_WIDTH.sm
// + 40 the camera dock. The clamp exists to stop those from eating a small
// pane -- never to replace them with a blind container fraction.
const declared: FitPadding = { topLeft: [300, 32], bottomRight: [360, 32] }

describe('clampPadding', () => {
  it('a declared padding inside the share is returned unchanged', () => {
    // 1920 x 1080: a quarter is 480 x 270, so every declaration fits.
    expect(clampPadding(declared, { width: 1920, height: 1080 })).toEqual(declared)
  })

  it('a declared padding beyond the share is clamped', () => {
    // 1024 wide: a quarter is 256, so the 300 px telemetry card is cut back.
    const out = clampPadding(declared, { width: 1024, height: 1080 })
    expect(out.topLeft[0]).toBe(256)
    expect(out.bottomRight[0]).toBe(256)
    // The vertical declarations are well inside a quarter of 1080.
    expect(out.topLeft[1]).toBe(32)
    expect(out.bottomRight[1]).toBe(32)
  })

  it('both axes clamp independently', () => {
    // A short, wide pane: x is inside the share, y is not.
    const out = clampPadding({ topLeft: [100, 200], bottomRight: [100, 200] }, { width: 1600, height: 400 })
    expect(out.topLeft).toEqual([100, 100])
    expect(out.bottomRight).toEqual([100, 100])
  })

  it('zero padding stays zero', () => {
    // The touch shell floats nothing over the map while watching.
    const zero: FitPadding = { topLeft: [0, 0], bottomRight: [0, 0] }
    expect(clampPadding(zero, { width: 820, height: 1180 })).toEqual(zero)
  })

  it('takes a share other than the default quarter', () => {
    expect(clampPadding(declared, { width: 1024, height: 1080 }, 0.1).topLeft[0]).toBe(102)
  })

  it('an unmeasured pane leaves the declaration alone, rather than clamping it to nothing', () => {
    // A Leaflet container read before layout reports 0 x 0; clamping to zero
    // there would fit the site edge-to-edge under the panels for one paint.
    expect(clampPadding(declared, { width: 0, height: 0 })).toEqual(declared)
  })
})

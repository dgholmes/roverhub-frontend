import { describe, expect, it } from 'vitest'
import {
  FOLLOW_DEAD_ZONE_FRACTION, FOLLOW_SPAN_M, MINI_FOLLOW_SPAN_M,
  focusPoint, followReducer, followSpanM, followZoom, initialFollow, isFinitePosition, isRememberedMapView,
  restoredZoom, shouldPan, viewToRemember, visibleRect,
} from './mapFollow'

describe('followSpanM', () => {
  it('frames the full map closer than the inset', () => {
    expect(followSpanM('full')).toBe(FOLLOW_SPAN_M)
    expect(followSpanM('mini')).toBe(MINI_FOLLOW_SPAN_M)
    expect(FOLLOW_SPAN_M).toBeLessThan(MINI_FOLLOW_SPAN_M)
  })
})

describe('visibleRect and focusPoint', () => {
  it('is the pane itself with no padding', () => {
    expect(visibleRect({ x: 800, y: 600 })).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    expect(focusPoint({ x: 800, y: 600 })).toEqual({ x: 400, y: 300 })
  })

  it('holds the robot in the middle of what the panels leave visible', () => {
    // MapFirstView: a 300 px telemetry card on the left, the dock on the right.
    const pad = { topLeft: [300, 32] as [number, number], bottomRight: [100, 32] as [number, number] }
    expect(focusPoint({ x: 1200, y: 800 }, pad)).toEqual({ x: 700, y: 400 })
  })

  it('ignores a padding that would leave nothing visible', () => {
    const pad = { topLeft: [500, 0] as [number, number], bottomRight: [500, 0] as [number, number] }
    expect(focusPoint({ x: 800, y: 600 }, pad)).toEqual({ x: 400, y: 300 })
  })
})

describe('followZoom', () => {
  it('shows the span across the smaller axis', () => {
    // 512 px / 8 m = 64 px per metre = 2^6.
    expect(followZoom({ x: 1000, y: 512 }, 8)).toBe(6)
  })

  it('snaps down so the whole span still fits', () => {
    const z = followZoom({ x: 1000, y: 600 }, 8)!
    expect(z % 0.25).toBe(0)
    expect(2 ** z * 8).toBeLessThanOrEqual(600)
    expect(2 ** (z + 0.25) * 8).toBeGreaterThan(600)
  })

  it('measures against what the panels leave visible', () => {
    const pad = { topLeft: [0, 0] as [number, number], bottomRight: [0, 256] as [number, number] }
    expect(followZoom({ x: 1000, y: 512 }, 8, { padding: pad })).toBe(5)
  })

  it('is clamped to the map range', () => {
    expect(followZoom({ x: 100000, y: 100000 }, 1)).toBe(7)
    expect(followZoom({ x: 10, y: 10 }, 100)).toBe(1)
  })

  it('has no answer for a pane not laid out yet', () => {
    expect(followZoom({ x: 0, y: 0 }, 8)).toBeNull()
    expect(followZoom({ x: 400, y: 300 }, 0)).toBeNull()
  })

  it('zooms in closer than the inset on a pane the same size', () => {
    const size = { x: 400, y: 300 }
    expect(followZoom(size, followSpanM('full'))!).toBeGreaterThan(followZoom(size, followSpanM('mini'))!)
  })
})

describe('shouldPan', () => {
  const size = { x: 400, y: 200 }
  const focus = { x: 200, y: 100 }

  it('holds still while the robot is inside the dead zone', () => {
    // Radius 0.2 * the SMALLER axis = 40 px.
    expect(shouldPan({ x: 210, y: 105 }, focus, size)).toBe(false)
    expect(shouldPan({ x: 239, y: 100 }, focus, size)).toBe(false)
  })

  it('pans once the robot leaves it', () => {
    expect(shouldPan({ x: 241, y: 100 }, focus, size)).toBe(true)
    expect(shouldPan({ x: 200, y: 10 }, focus, size)).toBe(true)
  })

  it('measures the zone against the smaller axis', () => {
    expect(shouldPan({ x: 80, y: 300 }, { x: 50, y: 300 }, { x: 100, y: 600 })).toBe(true)
    expect(shouldPan({ x: 60, y: 300 }, { x: 50, y: 300 }, { x: 100, y: 600 })).toBe(false)
  })

  it('uses FOLLOW_DEAD_ZONE_FRACTION by default', () => {
    expect(shouldPan({ x: 200 + 200 * FOLLOW_DEAD_ZONE_FRACTION + 1, y: 100 }, focus, size)).toBe(true)
  })
})

describe('isFinitePosition', () => {
  it('refuses a pose that would throw the view to nowhere', () => {
    expect(isFinitePosition({ x_m: 1, y_m: 2 })).toBe(true)
    expect(isFinitePosition({ x_m: Number.NaN, y_m: 2 })).toBe(false)
    expect(isFinitePosition({ x_m: 1, y_m: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isFinitePosition(undefined)).toBe(false)
  })
})

describe('followReducer', () => {
  it('opens following', () => {
    expect(initialFollow('r1')).toEqual({ robotId: 'r1', following: true, epoch: 0, restore: null })
  })

  it("pauses on the operator's drag, without a new frame", () => {
    const s = followReducer(initialFollow('r1'), { type: 'pause' })
    expect(s).toEqual({ robotId: 'r1', following: false, epoch: 0, restore: null })
    expect(followReducer(s, { type: 'pause' })).toBe(s)
  })

  it('resumes with a fresh frame', () => {
    const paused = followReducer(initialFollow('r1'), { type: 'pause' })
    expect(followReducer(paused, { type: 'resume' })).toEqual({ robotId: 'r1', following: true, epoch: 1, restore: null })
  })

  it('reframes on resume even while following, to restore the close-up', () => {
    expect(followReducer(initialFollow('r1'), { type: 'resume' }).epoch).toBe(1)
  })

  it('a different robot turns following back on and reframes on it', () => {
    const paused = followReducer(initialFollow('r1'), { type: 'pause' })
    expect(followReducer(paused, { type: 'robot', robotId: 'r2' })).toEqual({ robotId: 'r2', following: true, epoch: 1, restore: null })
  })

  it('the same robot again changes nothing', () => {
    const s = initialFollow('r1')
    expect(followReducer(s, { type: 'robot', robotId: 'r1' })).toBe(s)
  })
})

describe('isRememberedMapView', () => {
  it('accepts following, with or without a zoom', () => {
    expect(isRememberedMapView({ following: true })).toBe(true)
    expect(isRememberedMapView({ following: true, zoom: 4.5 })).toBe(true)
  })

  it('accepts paused only with a zoom and a centre to open at', () => {
    expect(isRememberedMapView({ following: false, zoom: 3, centre: { x_m: 1, y_m: -2 } })).toBe(true)
    expect(isRememberedMapView({ following: false, zoom: 3 })).toBe(false)
    expect(isRememberedMapView({ following: false, centre: { x_m: 1, y_m: 2 } })).toBe(false)
  })

  it('refuses anything else, so a bad value reads as nothing remembered', () => {
    for (const v of [
      null, 42, 'follow', [], {}, { following: 'yes' },
      { following: true, zoom: null }, { following: true, zoom: '4' }, { following: true, zoom: Number.NaN },
      { following: false, zoom: 3, centre: { x_m: Number.NaN, y_m: 0 } },
      { following: false, zoom: 3, centre: { x_m: 1 } },
      { following: false, zoom: 3, centre: [1, 2] },
    ]) expect(isRememberedMapView(v)).toBe(false)
  })
})

describe('restoredZoom', () => {
  it('clamps a remembered zoom to the map range', () => {
    expect(restoredZoom(4.25, { minZoom: 1, maxZoom: 7 })).toBe(4.25)
    expect(restoredZoom(12, { minZoom: 1, maxZoom: 7 })).toBe(7)
    expect(restoredZoom(-3, { minZoom: 1, maxZoom: 7 })).toBe(1)
  })

  it('has no answer for no zoom or a non-finite one', () => {
    expect(restoredZoom(undefined, { minZoom: 1, maxZoom: 7 })).toBeNull()
    expect(restoredZoom(Number.NaN, { minZoom: 1, maxZoom: 7 })).toBeNull()
  })
})

describe('viewToRemember', () => {
  const view = { zoom: 5, centre: { x_m: 3, y_m: 4 } }

  it('keeps only the zoom while following: the robot is the centre', () => {
    expect(viewToRemember(true, view)).toEqual({ following: true, zoom: 5 })
  })

  it('keeps the centre too while paused', () => {
    expect(viewToRemember(false, view)).toEqual({ following: false, zoom: 5, centre: { x_m: 3, y_m: 4 } })
  })
})

describe('following from a remembered view', () => {
  it('follows as today with nothing remembered', () => {
    expect(initialFollow('r1', null)).toEqual({ robotId: 'r1', following: true, epoch: 0, restore: null })
  })

  it('follows at the remembered zoom, never at a remembered centre', () => {
    const s = initialFollow('r1', { following: true, zoom: 4, centre: { x_m: 50, y_m: 50 } } as never)
    expect(s).toEqual({ robotId: 'r1', following: true, epoch: 0, restore: { zoom: 4 } })
  })

  it('follows at the close-up when following was remembered without a zoom', () => {
    expect(initialFollow('r1', { following: true }).restore).toBeNull()
  })

  it('opens paused at the remembered centre and zoom', () => {
    const s = initialFollow('r1', { following: false, zoom: 3, centre: { x_m: 1, y_m: 2 } })
    expect(s).toEqual({ robotId: 'r1', following: false, epoch: 0, restore: { zoom: 3, centre: { x_m: 1, y_m: 2 } } })
  })

  it('Follow robot drops the remembered view: the close-up, as always', () => {
    const s = initialFollow('r1', { following: true, zoom: 2 })
    expect(followReducer(s, { type: 'resume' })).toEqual({ robotId: 'r1', following: true, epoch: 1, restore: null })
    const paused = initialFollow('r1', { following: false, zoom: 3, centre: { x_m: 1, y_m: 2 } })
    expect(followReducer(paused, { type: 'resume' }).restore).toBeNull()
  })

  it('a drag drops it, so pausing never jumps back to the remembered view', () => {
    const s = initialFollow('r1', { following: true, zoom: 2 })
    expect(followReducer(s, { type: 'pause' }).restore).toBeNull()
  })

  it("another robot opens at that robot's remembered view", () => {
    const s = initialFollow('r1')
    const paused = { following: false, zoom: 3, centre: { x_m: 1, y_m: 2 } }
    expect(followReducer(s, { type: 'robot', robotId: 'r2', remembered: paused }))
      .toEqual({ robotId: 'r2', following: false, epoch: 1, restore: { zoom: 3, centre: { x_m: 1, y_m: 2 } } })
    expect(followReducer(s, { type: 'robot', robotId: 'r2', remembered: { following: true, zoom: 5 } }))
      .toEqual({ robotId: 'r2', following: true, epoch: 1, restore: { zoom: 5 } })
  })
})

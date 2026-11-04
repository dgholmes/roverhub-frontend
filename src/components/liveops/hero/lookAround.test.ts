import { describe, expect, it } from 'vitest'
import { applyLookDelta, LOOK_LIMIT_DEG, LOOK_NEUTRAL, lookTargetDue } from './lookAround'

describe('applyLookDelta', () => {
  it('looks right when the mouse moves right', () => {
    expect(applyLookDelta(LOOK_NEUTRAL, 100, 0)).toEqual({ pitchDeg: 0, yawDeg: 5 })
  })

  it('looks up (negative pitch, a backward lean) when the mouse moves up', () => {
    expect(applyLookDelta(LOOK_NEUTRAL, 0, -100)).toEqual({ pitchDeg: -5, yawDeg: 0 })
  })

  it('clamps a flick to the SDK limit on each axis', () => {
    expect(applyLookDelta(LOOK_NEUTRAL, 10_000, 10_000)).toEqual({ pitchDeg: LOOK_LIMIT_DEG, yawDeg: LOOK_LIMIT_DEG })
    expect(applyLookDelta(LOOK_NEUTRAL, -10_000, -10_000)).toEqual({ pitchDeg: -LOOK_LIMIT_DEG, yawDeg: -LOOK_LIMIT_DEG })
  })

  it('leaves the target alone on zero movement', () => {
    expect(applyLookDelta({ pitchDeg: 3, yawDeg: -2 }, 0, 0)).toEqual({ pitchDeg: 3, yawDeg: -2 })
  })
})

describe('lookTargetDue', () => {
  const at = (yawDeg: number) => ({ pitchDeg: 0, yawDeg })

  it('sends the first target at once', () => {
    expect(lookTargetDue(null, at(0), 0, 0)).toBe(true)
  })

  it('waits out the send interval however far the target moved', () => {
    expect(lookTargetDue(at(0), at(5), 0, 100)).toBe(false)
  })

  it('ignores movement under a degree', () => {
    expect(lookTargetDue(at(0), at(0.5), 0, 300)).toBe(false)
  })

  it('sends a change of a degree once the interval has passed', () => {
    expect(lookTargetDue(at(0), at(1), 0, 300)).toBe(true)
  })
})

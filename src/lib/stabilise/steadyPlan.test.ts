import { describe, expect, it } from 'vitest'
import { LOOKAHEAD_FRAMES, steadyPlan } from './steadyPlan'

describe('steadyPlan (Auto: steady to watch, fast to drive)', () => {
  it('shows the plain stream when Steady is off', () => {
    expect(steadyPlan({ steady: false, holdsControl: false, edgeSteadies: false }))
      .toEqual({ raw: false, smoothing: 'off' })
  })

  it('smooths with lookahead in the browser while watching', () => {
    expect(steadyPlan({ steady: true, holdsControl: false, edgeSteadies: false }))
      .toEqual({ raw: false, smoothing: 'lookahead' })
    expect(LOOKAHEAD_FRAMES).toBe(4)
  })

  it('drops to causal, no delay, while this viewer drives', () => {
    expect(steadyPlan({ steady: true, holdsControl: true, edgeSteadies: false }))
      .toEqual({ raw: false, smoothing: 'causal' })
  })

  it('takes the edge device\'s steadied stream as it is, never smoothing it twice', () => {
    expect(steadyPlan({ steady: true, holdsControl: false, edgeSteadies: true }))
      .toEqual({ raw: false, smoothing: 'off' })
  })

  it('asks the edge for the raw stream when it steadies and that is not wanted', () => {
    // Off: the viewer wants the plain picture.
    expect(steadyPlan({ steady: false, holdsControl: false, edgeSteadies: true }))
      .toEqual({ raw: true, smoothing: 'off' })
    // Driving: the edge's stream carries its lookahead delay; smooth the raw one causally here.
    expect(steadyPlan({ steady: true, holdsControl: true, edgeSteadies: true }))
      .toEqual({ raw: true, smoothing: 'causal' })
  })
})

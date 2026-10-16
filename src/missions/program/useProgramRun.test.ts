import { describe, expect, it } from 'vitest'
import { STOP_GRACE_MS, stopDecision } from './useProgramRun'

describe('stopDecision', () => {
  it('stops at once after the grace', () => {
    expect(stopDecision(STOP_GRACE_MS, 1)).toBe('now')
    expect(stopDecision(STOP_GRACE_MS + 5000, 2)).toBe('now')
  })
  it('ignores the second click of a double-click on Run', () => {
    expect(stopDecision(150, 2)).toBe('ignore')
  })
  it('defers any other Stop in the grace instead of dropping it', () => {
    expect(stopDecision(150, 1)).toBe('defer')
    // Keyboard activation has no click count.
    expect(stopDecision(0, 0)).toBe('defer')
  })
})

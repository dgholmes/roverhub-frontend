import { describe, expect, it } from 'vitest'
import { STATE_DISPLAY, stateVisualFor } from './stateDisplay'
import type { AbstractState } from '@/types'

const ALL_STATES: AbstractState[] = [
  'PASSIVE', 'STAND', 'MANUAL', 'ASSISTED', 'AUTO_MISSION', 'RETURNING', 'DOCKING', 'FAULT', 'E_STOP',
]

/** `stand_down`, `ready` and `passive` all collapse to abstract PASSIVE, but they
 * are different things to an operator: the first two hold with motors energised,
 * the third de-energises them. Sitting a robot used to display "Passive" --
 * i.e. "limp, motors off" -- which is what prompted this. */
describe('stateVisualFor', () => {
  it('calls a sitting robot Sitting, not Passive', () => {
    expect(stateVisualFor('PASSIVE', 'stand_down').label).toBe('Sitting')
  })

  it('distinguishes all three down states', () => {
    expect(stateVisualFor('PASSIVE', 'stand_down').label).toBe('Sitting')
    expect(stateVisualFor('PASSIVE', 'ready').label).toBe('Safe Stop')
    expect(stateVisualFor('PASSIVE', 'passive').label).toBe('Passive')
  })

  it('keeps PASSIVE visual treatment when refining the label', () => {
    // Command availability is identical across the three (docs/05-ui-ux.md §5.1)
    // and commandPolicy keys off abstract_state alone, so only the wording changes.
    const sitting = stateVisualFor('PASSIVE', 'stand_down')
    const base = STATE_DISPLAY.PASSIVE
    expect(sitting.color).toBe(base.color)
    expect(sitting.bg).toBe(base.bg)
    expect(sitting.border).toBe(base.border)
    expect(sitting.pulsing).toBe(base.pulsing)
  })

  it('does not mutate STATE_DISPLAY', () => {
    stateVisualFor('PASSIVE', 'stand_down')
    expect(STATE_DISPLAY.PASSIVE.label).toBe('Passive')
  })

  it('falls back to the abstract label with no sdk_state', () => {
    expect(stateVisualFor('PASSIVE').label).toBe('Passive')
  })

  it('falls back rather than blanking on an unmapped sdk_state', () => {
    // A new SDK state mapped into PASSIVE upstream must never render an empty pill.
    expect(stateVisualFor('PASSIVE', 'some_future_state').label).toBe('Passive')
  })

  it('ignores sdk_state for every non-PASSIVE state', () => {
    for (const state of ALL_STATES.filter((s) => s !== 'PASSIVE')) {
      // A stale/odd sdk_state must not relabel an upright or faulted robot.
      expect(stateVisualFor(state, 'stand_down')).toEqual(STATE_DISPLAY[state])
      expect(stateVisualFor(state, 'walk')).toEqual(STATE_DISPLAY[state])
    }
  })

  it('returns a non-empty label for every abstract state', () => {
    for (const state of ALL_STATES) {
      expect(stateVisualFor(state, 'stand_down').label.length).toBeGreaterThan(0)
    }
  })
})

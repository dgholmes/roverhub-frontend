import { describe, expect, it } from 'vitest'
import { ESTOP_HOLD_MS, estopHoldReducer, initialEstopHoldState, type EstopHoldState } from '@/liveops/estopHold'
import { isSpaceKey, spaceHoldFollowUp } from './spaceStop'

describe('isSpaceKey', () => {
  it('knows Space under both names browsers have used', () => {
    expect(isSpaceKey(' ')).toBe(true)
    expect(isSpaceKey('Spacebar')).toBe(true)
    expect(isSpaceKey('s')).toBe(false)
  })
})

describe('Space hold, driven the way the overlay drives it', () => {
  const pressed = () => estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })

  it('arms on press and fires only once the hold reaches the E-Stop hold time', () => {
    expect(estopHoldReducer(pressed(), { type: 'HOLD_TICK', elapsedMs: 400 }).phase).toBe('arming')
    expect(estopHoldReducer(pressed(), { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS }).phase).toBe('sent')
  })

  it('leaves only the stop when released early', () => {
    const half = estopHoldReducer(pressed(), { type: 'HOLD_TICK', elapsedMs: 400 })
    expect(estopHoldReducer(half, { type: 'RELEASE' }).phase).toBe('idle')
  })

  it('never starts a second E-Stop while one is in flight', () => {
    const sent = estopHoldReducer(pressed(), { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    expect(estopHoldReducer(sent, { type: 'PRESS' }).phase).toBe('sent')
  })
})

describe('spaceHoldFollowUp', () => {
  const at = (phase: EstopHoldState['phase']): EstopHoldState => ({ phase, progress: 1 })

  it('confirms once the robot reports E_STOP', () => {
    expect(spaceHoldFollowUp(at('sent'), 'E_STOP', true)).toEqual({ type: 'CONFIRMED' })
    expect(spaceHoldFollowUp(at('sent'), 'MANUAL', true)).toBeNull()
  })

  it('resets after a finished hold only once Space is up', () => {
    expect(spaceHoldFollowUp(at('confirmed'), 'E_STOP', false)).toEqual({ type: 'RESET' })
    expect(spaceHoldFollowUp(at('confirmed'), 'E_STOP', true)).toBeNull()
    expect(spaceHoldFollowUp(at('failed'), 'MANUAL', false)).toEqual({ type: 'RESET' })
  })

  it('leaves an idle or arming hold alone', () => {
    expect(spaceHoldFollowUp(initialEstopHoldState, 'MANUAL', false)).toBeNull()
    expect(spaceHoldFollowUp({ phase: 'arming', progress: 0.5 }, 'MANUAL', true)).toBeNull()
  })
})

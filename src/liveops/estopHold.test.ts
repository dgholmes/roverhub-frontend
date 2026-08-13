import { describe, expect, it } from 'vitest'
import {
  CONFIRM_TIMEOUT_MS,
  ESTOP_HOLD_MS,
  estopHoldReducer,
  initialEstopHoldState,
} from './estopHold'

describe('estopHoldReducer', () => {
  it('starts idle with no progress', () => {
    expect(initialEstopHoldState).toEqual({ phase: 'idle', progress: 0 })
  })

  it('enters arming on press', () => {
    const s = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    expect(s.phase).toBe('arming')
    expect(s.progress).toBe(0)
  })

  it('reports partial progress part-way through the hold', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const s = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS / 2 })
    expect(s.phase).toBe('arming')
    expect(s.progress).toBeCloseTo(0.5)
  })

  it('aborts back to idle when released before the hold completes', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const partway = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS - 1 })
    const s = estopHoldReducer(partway, { type: 'RELEASE' })
    expect(s).toEqual({ phase: 'idle', progress: 0 })
  })

  it('fires once the hold duration is reached', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const s = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    expect(s.phase).toBe('sent')
    expect(s.progress).toBe(1)
  })

  it('clamps progress to 1 if a tick overshoots the hold duration', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const s = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS * 4 })
    expect(s.progress).toBe(1)
  })

  // Releasing the button must never retract a stop that has already gone to the
  // robot -- the operator lifting their finger is the expected end of the
  // gesture, not a cancellation.
  it('stays sent when the button is released after firing', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    expect(estopHoldReducer(sent, { type: 'RELEASE' }).phase).toBe('sent')
  })

  it('reaches confirmed when the robot acknowledges', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    expect(estopHoldReducer(sent, { type: 'CONFIRMED' }).phase).toBe('confirmed')
  })

  it('reaches failed with the reported reason when the command fails', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    const s = estopHoldReducer(sent, { type: 'FAILED', reason: 'bridge rejected' })
    expect(s.phase).toBe('failed')
    expect(s.failureReason).toBe('bridge rejected')
  })

  // The whole point of the timeout: silence is a failure, not a pending state.
  it('fails on confirmation timeout rather than waiting indefinitely', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    const s = estopHoldReducer(sent, { type: 'TIMEOUT' })
    expect(s.phase).toBe('failed')
    expect(s.failureReason).toMatch(/not confirmed/i)
  })

  it('ignores a timeout that arrives when nothing is in flight', () => {
    expect(estopHoldReducer(initialEstopHoldState, { type: 'TIMEOUT' })).toEqual(initialEstopHoldState)
  })

  it('ignores a late acknowledgement once the attempt has failed', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    const failed = estopHoldReducer(sent, { type: 'TIMEOUT' })
    expect(estopHoldReducer(failed, { type: 'CONFIRMED' }).phase).toBe('failed')
  })

  // A failed stop must be retryable without a page reload.
  it('returns to idle on reset so the operator can retry', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    const failed = estopHoldReducer(sent, { type: 'TIMEOUT' })
    expect(estopHoldReducer(failed, { type: 'RESET' })).toEqual(initialEstopHoldState)
  })

  it('ignores a press while a stop is already in flight', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    expect(estopHoldReducer(sent, { type: 'PRESS' }).phase).toBe('sent')
  })

  it('allows a fresh press after a failure', () => {
    const armed = estopHoldReducer(initialEstopHoldState, { type: 'PRESS' })
    const sent = estopHoldReducer(armed, { type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS })
    const failed = estopHoldReducer(sent, { type: 'TIMEOUT' })
    expect(estopHoldReducer(failed, { type: 'PRESS' }).phase).toBe('arming')
  })
})

describe('timing constants', () => {
  // Long enough that a stray click cannot fire it, short enough to stay usable
  // in an emergency. Both bounds matter, so both are asserted.
  it('holds long enough to reject a stray click but stays under a second', () => {
    expect(ESTOP_HOLD_MS).toBeGreaterThanOrEqual(500)
    expect(ESTOP_HOLD_MS).toBeLessThanOrEqual(1000)
  })

  it('gives the robot longer to confirm than the hold takes to arm', () => {
    expect(CONFIRM_TIMEOUT_MS).toBeGreaterThan(ESTOP_HOLD_MS)
  })
})

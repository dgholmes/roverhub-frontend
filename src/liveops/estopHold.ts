/**
 * E-Stop engage gesture and dispatch outcome, as a pure state machine.
 *
 * Two things drove this shape:
 *
 * 1. **Hold, not click-then-confirm.** The previous control opened a Radix
 *    dialog to confirm. That dialog renders through a portal to `document.body`
 *    — outside the fullscreen element — so in fullscreen it was invisible while
 *    still trapping focus, and it cost ~600px of mouse travel in the one moment
 *    where travel matters. Holding the button is both faster in an emergency
 *    and harder to trigger by accident, and it involves no portal at all.
 *
 * 2. **Silence is a failure.** `sent` is not a resting state. If the robot does
 *    not acknowledge within CONFIRM_TIMEOUT_MS the machine reports `failed`, so
 *    the operator is told to reach for the physical E-Stop instead of watching
 *    a spinner. See docs/audit/2026-08-12-ui-ux-audit.md A-02/A-04/P1-2.
 *
 * Kept as a pure reducer in its own module so it is unit-testable — the
 * frontend test environment is `node`, with no component renderer.
 */
import i18n from '@/i18n'

/** Hold duration to engage. Long enough that a stray click cannot fire it,
 * short enough to stay usable under stress. */
export const ESTOP_HOLD_MS = 800

/** How long the robot has to acknowledge before the attempt is called failed. */
export const CONFIRM_TIMEOUT_MS = 5000

/** Shown when the robot never acknowledges. A function, not a constant, so it
 * comes out in the language current when the timeout fires. */
export function estopTimeoutReason(): string {
  return i18n.t('command.estop.timeoutReason')
}

export interface EstopHoldState {
  phase: 'idle' | 'arming' | 'sent' | 'confirmed' | 'failed'
  /** 0..1 — drives the radial fill while arming. */
  progress: number
  failureReason?: string
}

export type EstopHoldEvent =
  | { type: 'PRESS' }
  | { type: 'HOLD_TICK'; elapsedMs: number }
  | { type: 'RELEASE' }
  | { type: 'CONFIRMED' }
  | { type: 'FAILED'; reason: string }
  | { type: 'TIMEOUT' }
  | { type: 'RESET' }

export const initialEstopHoldState: EstopHoldState = { phase: 'idle', progress: 0 }

export function estopHoldReducer(state: EstopHoldState, event: EstopHoldEvent): EstopHoldState {
  switch (event.type) {
    case 'PRESS':
      // Only from a resting phase. A press while one stop is already in flight
      // must not start a second gesture.
      return state.phase === 'idle' || state.phase === 'failed'
        ? { phase: 'arming', progress: 0 }
        : state

    case 'HOLD_TICK': {
      if (state.phase !== 'arming') return state
      const progress = Math.min(1, event.elapsedMs / ESTOP_HOLD_MS)
      return event.elapsedMs >= ESTOP_HOLD_MS
        ? { phase: 'sent', progress: 1 }
        : { phase: 'arming', progress }
    }

    case 'RELEASE':
      // Releasing aborts the gesture, but never retracts a stop already sent —
      // lifting the finger is the expected end of a completed hold.
      return state.phase === 'arming' ? initialEstopHoldState : state

    case 'CONFIRMED':
      return state.phase === 'sent' ? { phase: 'confirmed', progress: 1 } : state

    case 'FAILED':
      return state.phase === 'sent'
        ? { phase: 'failed', progress: 1, failureReason: event.reason }
        : state

    case 'TIMEOUT':
      return state.phase === 'sent'
        ? { phase: 'failed', progress: 1, failureReason: estopTimeoutReason() }
        : state

    case 'RESET':
      return initialEstopHoldState
  }
}

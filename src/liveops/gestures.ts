import type { RobotState } from '@/types'

/**
 * How each one-tap gesture runs once started, and how it is stopped -- what the
 * LiveOps gesture card shows while one is going.
 *
 * Two kinds, and the robot treats them very differently:
 *
 * - **held**: runs until told otherwise. `wave` keeps waving until `wave` is
 *   sent again -- confirmed on rover-pi 2026-10-29, and exactly what the SDK's
 *   own wave() does (wave, wait, wave again). The wheel robot's drift / climb /
 *   handstand are modes in the same sense: the robot stays in them.
 * - **timed**: plays for a fixed length and ends by itself. Lengths are the
 *   vendored SDK's: its per-state waits (gongxi 11.5 s, dance0 126.5 s,
 *   jump 3 s) and its documented choreography lengths (groove 8 s, ...). None
 *   of these is reported by the robot, so the countdown is an estimate.
 *
 * `stop` is the state command that ends the gesture early, or null when none is
 * offered. Dobot's app stops a gesture by tapping it again, i.e. sending the
 * same state; that is verified for `wave` only (`stopVerified`). The v1.3.0
 * choreography moves get no Stop: they are one-shot sequences rather than
 * states, so sending one again may well restart it, and none lasts longer than
 * ~8 s. E-Stop stops anything.
 */

export type GestureKind = 'held' | 'timed'

export interface GestureSpec {
  kind: GestureKind
  /** Estimated run length for a timed gesture. */
  seconds?: number
  /** The SET_STATE target that stops it early, or null for no Stop button. */
  stop: string | null
  /** Whether `stop` has been seen to work on our robots. */
  stopVerified: boolean
}

const repeat = (state: string, verified = false): Pick<GestureSpec, 'stop' | 'stopVerified'> =>
  ({ stop: state, stopVerified: verified })

export const GESTURES: Readonly<Record<string, GestureSpec>> = {
  wave: { kind: 'held', ...repeat('wave', true) },
  gongxi: { kind: 'timed', seconds: 11.5, ...repeat('gongxi') },
  dance0: { kind: 'timed', seconds: 126.5, ...repeat('dance0') },
  jump: { kind: 'timed', seconds: 3, stop: null, stopVerified: false },
  backflip: { kind: 'timed', seconds: 2, stop: null, stopVerified: false },
  // SDK v1.3.0 choreography (quad), lengths from its API reference §2.14.
  twirl_jump: { kind: 'timed', seconds: 0.7, stop: null, stopVerified: false },
  diag_step: { kind: 'timed', seconds: 5.9, stop: null, stopVerified: false },
  hop_step: { kind: 'timed', seconds: 3, stop: null, stopVerified: false },
  groove: { kind: 'timed', seconds: 8, stop: null, stopVerified: false },
  bounce: { kind: 'timed', seconds: 6, stop: null, stopVerified: false },
  body_wave: { kind: 'timed', seconds: 8, stop: null, stopVerified: false },
  hip_circle: { kind: 'timed', seconds: 8, stop: null, stopVerified: false },
  head_circle: { kind: 'timed', seconds: 8, stop: null, stopVerified: false },
  // Wheel modes: left by commanding the normal wheel stance.
  drift: { kind: 'held', stop: 'wheel_loco', stopVerified: false },
  climb: { kind: 'held', stop: 'wheel_loco', stopVerified: false },
  handstand: { kind: 'held', stop: 'wheel_loco', stopVerified: false },
}

export function gestureSpec(id: string): GestureSpec | null {
  return GESTURES[id] ?? null
}

/** A gesture the console started and is tracking for the card. */
export interface ActiveGesture {
  robotId: string
  id: string
  label: string
  /** ms epoch, when it was sent. */
  startedAt: number
  /** True once the robot has reported being in the gesture's state. */
  seen: boolean
  /** True while a Stop is on its way. */
  stopping: boolean
}

/** Grace after a timed gesture's estimate before the card gives up on it. */
export const TIMED_GRACE_MS = 1500

/** How long a held gesture may go unconfirmed before the card gives up on it.
 * The robot reports the gesture within a poll or two of the command completing,
 * so one never seen in this long is one the console cannot track -- and a card
 * that cannot tell when the gesture ends must not sit there offering a Stop
 * that would only start it again. */
export const HELD_UNSEEN_MS = 6000

export interface GestureCardView {
  /** Seconds left for a timed gesture; null for a held one. */
  remainingS: number | null
  /** 0..1 through a timed gesture; null for a held one. */
  progress: number | null
  /** The card should go away. */
  over: boolean
  /** Stop may be offered: the robot is reported in the gesture right now.
   * Stop re-sends the gesture, so sent to a robot that has already finished
   * it, it starts the gesture again (2026-10-29). */
  canStop: boolean
}

/** What the card shows at `now`, and whether the gesture is over. */
export function gestureCardView(
  gesture: ActiveGesture,
  robot: Pick<RobotState, 'sdk_state' | 'abstract_state'> | undefined,
  now: number,
): GestureCardView {
  const spec = gestureSpec(gesture.id)
  const stopped = !robot || robot.abstract_state === 'E_STOP' || robot.abstract_state === 'FAULT'
  // A held gesture is over once the robot has been seen in it and has left.
  // Not before: the state update can lag the command by a poll or two.
  const left = gesture.seen && robot?.sdk_state !== gesture.id
  const canStop = !!spec?.stop && robot?.sdk_state === gesture.id
  const elapsedMs = now - gesture.startedAt
  if (!spec || spec.kind === 'held' || spec.seconds === undefined) {
    const unseen = !gesture.seen && elapsedMs > HELD_UNSEEN_MS
    return { remainingS: null, progress: null, over: stopped || left || unseen, canStop }
  }
  // A timed one ends at whichever comes first: the robot leaving its state, or
  // the estimate running out (a gesture whose state the robot never reports).
  const totalMs = spec.seconds * 1000
  return {
    remainingS: Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000)),
    progress: Math.min(1, Math.max(0, elapsedMs / totalMs)),
    over: stopped || left || elapsedMs > totalMs + TIMED_GRACE_MS,
    canStop,
  }
}

/** "1:52" for the card's countdown. */
export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

import type { LidarMountEstimate, TurnRefusal } from '@/types/sensors'

/**
 * "Turn it for me" (operator's choice C, 2026-11-18): the console turns the
 * robot on the spot so the bridge can measure where the lidar sits, with the
 * already-wired ROTATE -- no new command, no wire change.
 *
 * Eight half turns, alternating left and right so a tether never winds up,
 * each awaited to its terminal ack and followed by STILL_MS standing still:
 * the bridge counts a turn only with >= 0.5 s still before and after it. One
 * still wait comes first too, for the same reason. The bridge publishes a
 * turn on its next 1 s tick, so after the still wait the runner waits up to
 * SEEN_WAIT_MS in all (from the ack) for that turn's `last_turn` to arrive
 * before going on, so a refusal is counted before the next turn is sent.
 *
 * It ends early, and says why, when a turn fails or is refused, when the
 * robot stops standing or control leaves this operator (asked of `blocked`
 * before every turn), when the robot reports the offset confident
 * (`offset_confident`, which also needs a small spread -- never the counts),
 * or after MAX_REFUSED_IN_A_ROW turns in a row the robot saw but did not
 * count. Stop sends no more turns after the one in flight; cancel (the page
 * was left) is the same, silently. E-Stop is never this module's.
 *
 * Kept counts are not monotonic (the bridge drops outliers later), so "the
 * robot counted none" means: no turn seen kept during the run and the total
 * the same as at the start.
 *
 * Pure: `send` and `sleep` are injected, so the whole plan runs under fake
 * timers in its tests.
 */

export type TurnDirection = 'left' | 'right'

export const TURN_COUNT = 8
export const TURN_ANGLE_DEG = 180
export const STILL_MS = 2_000
/** From a turn's ack: how long to wait for the robot to report that turn. */
export const SEEN_WAIT_MS = 3_000
export const MAX_REFUSED_IN_A_ROW = 3
export const TURN_PLAN: readonly TurnDirection[] = Array.from({ length: TURN_COUNT }, (_, k) => (k % 2 === 0 ? 'left' : 'right'))

/** A ROTATE's outcome: completed, or why not (the ack's own reason). */
export type TurnSendResult = { ok: true } | { ok: false; reason: string }

/** Why the run may not go on now; asked before every turn. */
export type TurnBlock = 'notStanding' | 'lostControl' | 'offline'

export type TurnRunEnd =
  /** All eight turned, and the robot counted at least one. */
  | { kind: 'finished' }
  /** The robot reports the offset confident: nothing more to turn for. */
  | { kind: 'confident' }
  | { kind: 'stopped' }
  /** The page was left; nobody is told. */
  | { kind: 'cancelled' }
  | { kind: 'turnFailed'; reason: string }
  | { kind: TurnBlock }
  /** MAX_REFUSED_IN_A_ROW refused turns in a row; the last one's reason. */
  | { kind: 'refused'; reason: TurnRefusal | null }
  /** All eight turned and the robot counted none of them. */
  | { kind: 'noneCounted' }

export interface TurnRunnerDeps {
  send: (direction: TurnDirection, index: number) => Promise<TurnSendResult>
  sleep: (ms: number) => Promise<void>
  blocked: () => TurnBlock | null
  /** Turn `turn` (1-based) is about to be sent. */
  onTurn?: (turn: number) => void
}

export class TurnRunner {
  private readonly deps: TurnRunnerDeps
  private stopping: 'stopped' | 'cancelled' | null = null
  /** Wakes whatever wait is in progress: Stop, cancel, or a turn seen. */
  private wakers = new Set<() => void>()
  private readonly keptAtStart: number
  private kept: number
  private keptSeen = false
  private confident = false
  private lastTurnAt: string | null
  /** Turns the robot reported during the run, kept or not. */
  private seen = 0
  private refusedInARow = 0
  private lastReason: TurnRefusal | null = null
  private started = false

  /** `initial`: the estimate when the run starts, so earlier turns -- kept or
   * refused -- count toward nothing here. */
  constructor(deps: TurnRunnerDeps, initial: LidarMountEstimate | null) {
    this.deps = deps
    this.keptAtStart = initial?.turns ?? 0
    this.kept = this.keptAtStart
    this.confident = initial?.offset_confident === true
    this.lastTurnAt = initial?.last_turn?.at ?? null
  }

  /** Every new status's estimate, while the run lasts. */
  observe(m: LidarMountEstimate | null): void {
    if (!m) return
    this.kept = m.turns
    if (m.offset_confident === true) this.confident = true
    const turn = m.last_turn
    if (turn && turn.at !== this.lastTurnAt) {
      this.lastTurnAt = turn.at
      this.seen += 1
      if (turn.kept) {
        this.keptSeen = true
        this.refusedInARow = 0
      } else {
        this.refusedInARow += 1
        this.lastReason = turn.reason
      }
      this.wakeAll()
    }
  }

  /** No more turns after the one in flight. */
  stop(): void { this.end('stopped') }

  /** The page was left: the same, and nobody is told. */
  cancel(): void { this.end('cancelled') }

  get stopRequested(): boolean { return this.stopping !== null }

  async run(): Promise<TurnRunEnd> {
    if (this.started) throw new Error('a TurnRunner runs once')
    this.started = true
    await this.wait(STILL_MS)
    for (let k = 0; k < TURN_PLAN.length; k++) {
      const halt = this.halt()
      if (halt) return halt
      this.deps.onTurn?.(k + 1)
      const seenBefore = this.seen
      const sent = await this.deps.send(TURN_PLAN[k], k)
      if (this.stopping === 'cancelled') return { kind: 'cancelled' }
      if (!sent.ok) return { kind: 'turnFailed', reason: sent.reason }
      await this.wait(STILL_MS)
      if (this.seen === seenBefore) await this.wait(SEEN_WAIT_MS - STILL_MS, () => this.seen !== seenBefore)
    }
    if (this.stopping === 'cancelled') return { kind: 'cancelled' }
    if (this.confident) return { kind: 'confident' }
    // Stopped during the last turn: its waits were cut short, so the robot's
    // count may not have caught up -- say only that it stopped.
    if (this.stopping === 'stopped') return { kind: 'stopped' }
    if (this.refusedInARow >= MAX_REFUSED_IN_A_ROW) return { kind: 'refused', reason: this.lastReason }
    return !this.keptSeen && this.kept === this.keptAtStart ? { kind: 'noneCounted' } : { kind: 'finished' }
  }

  private halt(): TurnRunEnd | null {
    if (this.stopping) return { kind: this.stopping }
    if (this.confident) return { kind: 'confident' }
    if (this.refusedInARow >= MAX_REFUSED_IN_A_ROW) return { kind: 'refused', reason: this.lastReason }
    const blocked = this.deps.blocked()
    return blocked ? { kind: blocked } : null
  }

  private end(kind: 'stopped' | 'cancelled'): void {
    if (this.stopping === 'cancelled') return
    this.stopping = kind
    this.wakeAll()
  }

  private wakeAll(): void {
    for (const wake of [...this.wakers]) wake()
  }

  /** `ms`, cut short by Stop or cancel -- and, with `until`, as soon as it
   * holds (checked whenever a turn is seen). */
  private wait(ms: number, until?: () => boolean): Promise<void> {
    if (this.stopping || until?.()) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const wake = () => {
        if (!this.stopping && until && !until()) return
        this.wakers.delete(wake)
        resolve()
      }
      // A turn seen during a plain still wait must not cut it short.
      const plain = () => { if (this.stopping) { this.wakers.delete(plain); resolve() } }
      const waker = until ? wake : plain
      this.wakers.add(waker)
      void this.deps.sleep(ms).then(() => { this.wakers.delete(waker); resolve() })
    })
  }
}

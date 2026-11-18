import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LidarMountEstimate, LidarMountTurn, TurnRefusal } from '@/types/sensors'
import {
  MAX_REFUSED_IN_A_ROW, SEEN_WAIT_MS, STILL_MS, TURN_COUNT, TURN_PLAN, TurnRunner,
  type TurnBlock, type TurnDirection, type TurnRunEnd, type TurnSendResult,
} from './turnRunner'

const estimate = (over: Partial<LidarMountEstimate> = {}): LidarMountEstimate => ({
  x_m: null, y_m: null, sd_x_m: null, sd_y_m: null, roll_deg: 0, pitch_deg: 19.4, sd_tilt_deg: 0.1,
  turns: 0, still_samples: 800, since: null, updated_at: null,
  turns_left: 0, turns_right: 0, offset_confident: false, tilt_confident: true, last_turn: null,
  ...over,
})

let clock = 0
const turnAt = () => new Date(Date.UTC(2026, 10, 18) + ++clock * 1000).toISOString()
const kept = (): LidarMountTurn => ({ at: turnAt(), kept: true, reason: null, turned_deg: 179 })
const refused = (reason: TurnRefusal): LidarMountTurn => ({ at: turnAt(), kept: false, reason, turned_deg: 179 })

/** A fake robot: each ROTATE resolves after 4 s, then the robot reports
 * `report(k)` (if any) 1 s later, as the bridge's tick would. */
function harness(opts: {
  initial?: LidarMountEstimate | null
  result?: (k: number) => TurnSendResult
  report?: (k: number, runner: TurnRunner) => LidarMountEstimate | null
  blocked?: () => TurnBlock | null
} = {}) {
  const sent: TurnDirection[] = []
  const onTurn = vi.fn()
  const runner: TurnRunner = new TurnRunner({
    send: (direction, k) => {
      sent.push(direction)
      return new Promise((resolve) => setTimeout(() => {
        resolve(opts.result?.(k) ?? { ok: true })
        const m = opts.report?.(k, runner)
        if (m) setTimeout(() => runner.observe(m), 1000)
      }, 4000))
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    blocked: opts.blocked ?? (() => null),
    onTurn,
  }, opts.initial === undefined ? estimate() : opts.initial)
  let end: TurnRunEnd | null = null
  void runner.run().then((e) => { end = e })
  return { runner, sent, onTurn, ended: () => end }
}

/** The fake robot counting every turn it is sent. */
const counting = (k: number): LidarMountEstimate => estimate({
  turns: k + 1, turns_left: Math.ceil((k + 1) / 2), turns_right: Math.floor((k + 1) / 2), last_turn: kept(),
})

beforeEach(() => { vi.useFakeTimers(); clock = 0 })
afterEach(() => { vi.useRealTimers() })

describe('the plan', () => {
  it('is eight half turns alternating left and right', () => {
    expect(TURN_PLAN).toEqual(['left', 'right', 'left', 'right', 'left', 'right', 'left', 'right'])
    expect(TURN_COUNT).toBe(8)
  })
})

describe('TurnRunner', () => {
  it('stands still first, awaits each ack, stands still again, and finishes all eight', async () => {
    const h = harness({ report: counting })
    expect(h.sent).toEqual([])
    await vi.advanceTimersByTimeAsync(STILL_MS - 1)
    expect(h.sent).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(h.sent).toEqual(['left'])
    // The ack takes 4 s; nothing new is sent before it.
    await vi.advanceTimersByTimeAsync(4000 + STILL_MS - 1)
    expect(h.sent).toEqual(['left'])
    await vi.advanceTimersByTimeAsync(1)
    expect(h.sent).toEqual(['left', 'right'])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.sent).toEqual(TURN_PLAN)
    expect(h.onTurn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(h.ended()).toEqual({ kind: 'finished' })
  })

  it('waits up to 3 s from the ack for the robot to report the turn before the next one', async () => {
    // This robot reports each turn 2.5 s after the ack: later than the still wait.
    const runner = new TurnRunner({
      send: () => new Promise((resolve) => setTimeout(() => {
        resolve({ ok: true })
        setTimeout(() => runner.observe(estimate({ turns: 0, last_turn: refused('small_turn') })), 2500)
      }, 4000)),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      blocked: () => null,
    }, estimate())
    let end: TurnRunEnd | null = null
    void runner.run().then((e) => { end = e })
    // Three refusals, each seen before the next turn: stops before a fourth.
    await vi.advanceTimersByTimeAsync(STILL_MS + 3 * (4000 + 2500))
    expect(end).toEqual({ kind: 'refused', reason: 'small_turn' })
  })

  it('goes on after SEEN_WAIT_MS when the robot reports nothing', async () => {
    const h = harness()
    await vi.advanceTimersByTimeAsync(STILL_MS + 4000 + SEEN_WAIT_MS - 1)
    expect(h.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.sent).toHaveLength(2)
  })

  it('says the robot counted none when nothing it was sent was kept', async () => {
    const h = harness()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toHaveLength(8)
    expect(h.ended()).toEqual({ kind: 'noneCounted' })
  })

  it('does not call it "none counted" when kept turns were seen, even if outliers took the total back down', async () => {
    const h = harness({
      initial: estimate({ turns: 3 }),
      report: (k) => estimate({ turns: k === 0 ? 4 : 3, last_turn: kept() }),
    })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.ended()).toEqual({ kind: 'finished' })
  })

  it('stops once the robot reports the offset confident', async () => {
    const h = harness({ report: (k) => estimate({ turns: k + 1, offset_confident: k === 2, last_turn: kept() }) })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toHaveLength(3)
    expect(h.ended()).toEqual({ kind: 'confident' })
  })

  it('keys done on offset_confident, never the counts: 8/8 and 3 each way is not done', async () => {
    const h = harness({ initial: estimate({ turns: 8, turns_left: 4, turns_right: 4 }), report: counting })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toHaveLength(8)
    expect(h.ended()).toEqual({ kind: 'finished' })
  })

  it(`stops after ${MAX_REFUSED_IN_A_ROW} refused turns in a row, with the last reason`, async () => {
    const reasons: TurnRefusal[] = ['small_turn', 'match_ambiguous', 'match_ambiguous', 'match_no_scan']
    const h = harness({ report: (k) => estimate({ last_turn: k === 0 ? kept() : refused(reasons[k]) }) })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toHaveLength(4)
    expect(h.ended()).toEqual({ kind: 'refused', reason: 'match_no_scan' })
  })

  it('a kept turn breaks the run of refusals', async () => {
    const h = harness({ report: (k) => estimate({ turns: 1, last_turn: k % 3 === 2 ? kept() : refused('poor_match') }) })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toHaveLength(8)
  })

  it('ignores a refusal from before it started', async () => {
    const before = refused('match_ambiguous')
    const h = harness({
      initial: estimate({ last_turn: before }),
      report: () => estimate({ last_turn: before }),
    })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toHaveLength(8)
  })

  it('ends with the ack\'s reason when a turn fails or is refused', async () => {
    const h = harness({ result: (k) => (k === 1 ? { ok: false, reason: 'REJECTED_NOT_CONTROL_OWNER: control is held by someone else' } : { ok: true }) })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toEqual(['left', 'right'])
    expect(h.ended()).toEqual({ kind: 'turnFailed', reason: 'REJECTED_NOT_CONTROL_OWNER: control is held by someone else' })
  })

  it('asks before every turn whether it may go on: the robot sat, or control moved', async () => {
    let block: TurnBlock | null = null
    const h = harness({ blocked: () => block })
    await vi.advanceTimersByTimeAsync(STILL_MS + 4000)
    block = 'notStanding'
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.sent).toEqual(['left'])
    expect(h.ended()).toEqual({ kind: 'notStanding' })

    const h2 = harness({ blocked: () => 'lostControl' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h2.sent).toEqual([])
    expect(h2.ended()).toEqual({ kind: 'lostControl' })
  })

  it('Stop lets the turn in flight finish and sends no more', async () => {
    const h = harness({ report: counting })
    await vi.advanceTimersByTimeAsync(STILL_MS + 1000)
    expect(h.sent).toEqual(['left'])
    h.runner.stop()
    expect(h.runner.stopRequested).toBe(true)
    await vi.advanceTimersByTimeAsync(2999)
    expect(h.ended()).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.ended()).toEqual({ kind: 'stopped' })
    expect(h.sent).toEqual(['left'])
  })

  it('Stop during a still wait ends it at once', async () => {
    const h = harness({ report: counting })
    await vi.advanceTimersByTimeAsync(STILL_MS + 4000 + 500)
    h.runner.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.ended()).toEqual({ kind: 'stopped' })
    expect(h.sent).toEqual(['left'])
  })

  it('cancel (the page was left) sends no more turns', async () => {
    const h = harness({ report: counting })
    await vi.advanceTimersByTimeAsync(STILL_MS + 1000)
    h.runner.cancel()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.sent).toEqual(['left'])
    expect(h.ended()).toEqual({ kind: 'cancelled' })
  })

  it('does not start at all when the robot is already confident', async () => {
    const h = harness({ initial: estimate({ offset_confident: true }) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.sent).toEqual([])
    expect(h.ended()).toEqual({ kind: 'confident' })
  })
})

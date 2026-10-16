import { describe, expect, it } from 'vitest'
import type { RobotState } from '@/types'
import { evaluate, guardFailure, runProgram, type RunLogEntry, type RunnerEffects } from './run'
import type { CommandStep, Step } from './types'

function robot(over: Record<string, unknown> = {}): RobotState {
  return {
    abstract_state: 'STAND',
    posture: 'upright',
    battery: { percent: 80 },
    speed_ratio: 10,
    obstacle_avoidance: false,
    connectivity: { grpc: 'connected', bridge_state: 'connected' },
    control_owner: 'op',
    ...over,
  } as unknown as RobotState
}

const cmd = (id: string, type = 'STAND_UP'): CommandStep =>
  ({ kind: 'command', blockId: id, type, params: {}, label: id }) as CommandStep

function harness(opts: {
  results?: Array<'completed' | 'failed' | 'cancelled' | 'unknown'>
  robot?: () => RobotState | undefined
  owns?: () => boolean
  onSend?: (step: CommandStep, n: number) => Promise<void> | void
} = {}) {
  let clock = 0
  const sent: string[] = []
  const log: RunLogEntry[] = []
  const highlights: Array<string | null> = []
  const results = [...(opts.results ?? [])]
  const fx: RunnerEffects = {
    async send(step) {
      sent.push(step.blockId)
      await opts.onSend?.(step, sent.length)
      return results.shift() ?? 'completed'
    },
    robot: opts.robot ?? (() => robot()),
    ownsControl: opts.owns ?? (() => true),
    now: () => clock,
    sleep(ms, signal) {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
        clock += ms
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        resolve()
      })
    },
    log: (e) => log.push(e),
    highlight: (id) => highlights.push(id),
  }
  return { fx, sent, log, highlights, clock: () => clock }
}

describe('runProgram', () => {
  it('runs commands in order, one at a time, and clears the highlight', async () => {
    let inFlight = 0
    let overlap = false
    const h = harness({
      onSend: async () => {
        inFlight++
        if (inFlight > 1) overlap = true
        await Promise.resolve()
        inFlight--
      },
    })
    const out = await runProgram([cmd('a'), cmd('b'), cmd('c')], h.fx, new AbortController().signal)
    expect(out).toEqual({ result: 'completed', commandsSent: 3 })
    expect(h.sent).toEqual(['a', 'b', 'c'])
    expect(overlap).toBe(false)
    expect(h.log.filter((e) => e.result === 'done').map((e) => e.label)).toEqual(['a', 'b', 'c'])
    expect(h.highlights[h.highlights.length - 1]).toBeNull()
  })

  it.each([
    ['failed', 'failed', 'commandFailed'],
    ['cancelled', 'aborted', 'commandCancelled'],
    ['unknown', 'failed', 'noAnswer'],
  ] as const)('%s stops the run and sends nothing more', async (r, result, reason) => {
    const h = harness({ results: ['completed', r] })
    const out = await runProgram([cmd('a'), cmd('b'), cmd('c')], h.fx, new AbortController().signal)
    expect(out).toEqual({ result, reason, commandsSent: 2 })
    expect(h.sent).toEqual(['a', 'b'])
  })

  it('lets a slow send finish on Stop, then stops', async () => {
    const ac = new AbortController()
    const h = harness({ onSend: async (_s, n) => { if (n === 1) { ac.abort(); await Promise.resolve() } } })
    const out = await runProgram([cmd('a'), cmd('b')], h.fx, ac.signal)
    expect(h.sent).toEqual(['a'])
    expect(out).toEqual({ result: 'aborted', reason: 'stopped', commandsSent: 1 })
  })

  it('ends a wait promptly on Stop', async () => {
    const ac = new AbortController()
    const h = harness()
    const fx = { ...h.fx, sleep: (_ms: number, s: AbortSignal) => new Promise<void>((_, rej) => {
      s.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    }) }
    const p = runProgram([{ kind: 'wait', blockId: 'w', seconds: 60, label: 'w' }, cmd('a')], fx, ac.signal)
    ac.abort()
    expect(await p).toEqual({ result: 'aborted', reason: 'stopped', commandsSent: 0 })
    expect(h.sent).toEqual([])
  })

  it('guards: fallen, E_STOP, FAULT, unreachable, control lost; nothing sent', async () => {
    const cases: Array<[() => RobotState | undefined, boolean, string]> = [
      [() => robot({ posture: 'fallen' }), true, 'fallen'],
      [() => robot({ abstract_state: 'E_STOP' }), true, 'estop'],
      [() => robot({ abstract_state: 'FAULT' }), true, 'fault'],
      [() => robot({ connectivity: { grpc: 'unavailable', bridge_state: 'connected' } }), true, 'unreachable'],
      [() => undefined, true, 'unreachable'],
      [() => robot(), false, 'controlLost'],
    ]
    for (const [r, owns, reason] of cases) {
      const h = harness({ robot: r, owns: () => owns })
      const out = await runProgram([cmd('a')], h.fx, new AbortController().signal)
      expect(out).toEqual({ result: 'aborted', reason, commandsSent: 0 })
      expect(h.sent).toEqual([])
    }
  })

  it('treats unknown posture as neither fallen nor standing-blocking', () => {
    expect(guardFailure(robot({ posture: 'unknown' }), true)).toBeNull()
  })

  it('aborts mid-run when control is lost after the first command', async () => {
    let owns = true
    const h = harness({ owns: () => owns, onSend: () => { owns = false } })
    const out = await runProgram([cmd('a'), cmd('b')], h.fx, new AbortController().signal)
    expect(h.sent).toEqual(['a'])
    expect(out.reason).toBe('controlLost')
  })

  it('repeat and if', async () => {
    const h = harness()
    const steps: Step[] = [
      { kind: 'repeat', blockId: 'r', times: 3, label: 'r', body: [cmd('x')] },
      { kind: 'if', blockId: 'i', label: 'i', condition: { kind: 'fallen' }, then: [cmd('t')], else: [cmd('e')] },
    ]
    await runProgram(steps, h.fx, new AbortController().signal)
    expect(h.sent).toEqual(['x', 'x', 'x', 'e'])
  })

  it('repeatUntil stops when the condition turns true', async () => {
    let n = 0
    const h = harness({ onSend: () => { n++ }, robot: () => robot({ battery: { percent: n >= 2 ? 10 : 80 } }) })
    const out = await runProgram(
      [{ kind: 'repeatUntil', blockId: 'u', label: 'u', condition: { kind: 'batteryBelow', pct: 20 }, body: [cmd('x')] }],
      h.fx, new AbortController().signal)
    expect(out.result).toBe('completed')
    expect(h.sent).toEqual(['x', 'x'])
  })

  it('repeatUntil fails after 100 iterations', async () => {
    const h = harness()
    const out = await runProgram(
      [{ kind: 'repeatUntil', blockId: 'u', label: 'u', condition: { kind: 'fallen' }, body: [cmd('x')] }],
      h.fx, new AbortController().signal)
    expect(out).toEqual({ result: 'failed', reason: 'repeatUntilLimit', commandsSent: 100 })
  })

  it('waitUntil passes when true, and times out at 120 s on the fake clock', async () => {
    const ok = harness()
    expect((await runProgram([{ kind: 'waitUntil', blockId: 'w', label: 'w', condition: { kind: 'standing' } }], ok.fx, new AbortController().signal)).result).toBe('completed')
    const h = harness()
    const out = await runProgram([{ kind: 'waitUntil', blockId: 'w', label: 'w', condition: { kind: 'fallen' } }, cmd('a')], h.fx, new AbortController().signal)
    expect(out).toEqual({ result: 'failed', reason: 'waitUntilTimeout', commandsSent: 0 })
    expect(h.clock()).toBe(120_000)
  })

  it('stops after 500 commands', async () => {
    const h = harness()
    const out = await runProgram([{ kind: 'repeat', blockId: 'r', label: 'r', times: 1000, body: [cmd('x')] }], h.fx, new AbortController().signal)
    expect(out).toEqual({ result: 'failed', reason: 'commandLimit', commandsSent: 500 })
  })

  it('a missing condition is a failure', async () => {
    const h = harness()
    const out = await runProgram([{ kind: 'if', blockId: 'i', label: 'i', condition: { kind: 'missing' }, then: [cmd('t')], else: [] }], h.fx, new AbortController().signal)
    expect(out).toEqual({ result: 'failed', reason: 'conditionMissing', commandsSent: 0 })
  })
})

describe('evaluate', () => {
  it('unknown battery is false, never compared', () => {
    expect(evaluate({ kind: 'batteryBelow', pct: 50 }, robot({ battery: { percent: null } }))).toBe(false)
    expect(evaluate({ kind: 'batteryBelow', pct: 50 }, robot({ battery: { percent: 20 } }))).toBe(true)
  })
  it('standing: not fallen and in a standing state', () => {
    expect(evaluate({ kind: 'standing' }, robot())).toBe(true)
    expect(evaluate({ kind: 'standing' }, robot({ abstract_state: 'PASSIVE' }))).toBe(false)
    expect(evaluate({ kind: 'standing' }, robot({ posture: 'fallen' }))).toBe(false)
  })
  it('fallen is true only for posture fallen', () => {
    expect(evaluate({ kind: 'fallen' }, robot({ posture: 'unknown' }))).toBe(false)
    expect(evaluate({ kind: 'fallen' }, robot({ posture: 'fallen' }))).toBe(true)
  })
  it('avoidanceOn and no robot', () => {
    expect(evaluate({ kind: 'avoidanceOn' }, robot({ obstacle_avoidance: true }))).toBe(true)
    expect(evaluate({ kind: 'avoidanceOn' }, undefined)).toBe(false)
  })
})

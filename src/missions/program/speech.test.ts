import { describe, expect, it } from 'vitest'
import type { Command } from '@/types'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import { speechSteps } from './speech'
import type { CommandStep } from './types'

const say = (text: string, untilDone = false): CommandStep =>
  ({ kind: 'command', blockId: `b-${text}`, type: 'SPEAK', params: { volume: 80 }, label: text, speech: { text, untilDone } })

function io(result: CommandOutcome['result'] = 'completed') {
  const made: string[] = []
  const sent: Record<string, unknown>[] = []
  let finish: (r: CommandOutcome['result']) => void = () => {}
  return {
    made, sent, finish: (r: CommandOutcome['result']) => finish(r),
    createSpokenClip: async (_robot: string, text: string) => { made.push(text); return { clip_id: `clip-${made.length}` } },
    dispatchCommandAsync: (_robot: string, _type: string, _label: string, params?: Record<string, unknown>) => {
      sent.push(params ?? {})
      return new Promise<CommandOutcome>((resolve) => {
        finish = (r) => resolve({ result: r, command: {} as Command })
        if (result !== 'completed') finish(result)
        else queueMicrotask(() => finish('completed'))
      })
    },
  }
}

describe('speechSteps', () => {
  it('makes each text’s clip once per run and sends it with the volume', async () => {
    const x = io()
    const s = speechSteps(x, 'r1', () => {})
    for (const step of [say('hi'), say('bye'), say('hi')]) {
      await s.prepare(step)
      await s.send(step)
    }
    expect(x.made).toEqual(['hi', 'bye'])
    expect(x.sent).toEqual([{ clip_id: 'clip-1', volume: 80 }, { clip_id: 'clip-2', volume: 80 }, { clip_id: 'clip-1', volume: 80 }])
  })

  it('"until done" returns the playback outcome', async () => {
    const x = io('failed')
    const s = speechSteps(x, 'r1', () => {})
    await s.prepare(say('hi', true))
    expect(await s.send(say('hi', true))).toBe('failed')
  })

  it('"once" carries on, and reports a playback that fails afterwards', async () => {
    const x = io('unknown')
    const failed: string[] = []
    const s = speechSteps(x, 'r1', (step, r) => failed.push(`${step.label}:${r}`))
    await s.prepare(say('hi'))
    expect(await s.send(say('hi'))).toBe('completed')
    await Promise.resolve()
    expect(failed).toEqual(['hi:unknown'])
  })

  it('fails a step whose clip was never made', async () => {
    expect(await speechSteps(io(), 'r1', () => {}).send(say('hi'))).toBe('failed')
  })
})

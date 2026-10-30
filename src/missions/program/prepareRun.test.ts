import { describe, expect, it, vi } from 'vitest'
import { PrepareFailed, prepareRunSteps } from './prepareRun'
import type { CommandStep, Step } from './types'

const speak = (text: string, label = `Say ${text}`, volume = 70): CommandStep => ({
  kind: 'command', blockId: `b-${text}`, type: 'SPEAK', params: { volume }, label, speech: { text, untilDone: true },
})
const walk: CommandStep = { kind: 'command', blockId: 'w', type: 'LINE_WALK', params: { distance: 1 }, label: 'Walk' }
const clipper = () => vi.fn(async (_r: string, text: string) => ({ clip_id: `clip-${text}` }))

describe('prepareRunSteps', () => {
  it('test_prepare_sets_clip_ids_once_per_text', async () => {
    const make = clipper()
    const out = await prepareRunSteps([speak('hi'), speak('hi', 'again', 30), speak('bye')], 'r1', make)
    expect(make).toHaveBeenCalledTimes(2)
    expect(make).toHaveBeenCalledWith('r1', 'hi')
    const p = out.map((s) => (s as CommandStep).params)
    expect(p).toEqual([{ volume: 70, clip_id: 'clip-hi' }, { volume: 30, clip_id: 'clip-hi' }, { volume: 70, clip_id: 'clip-bye' }])
    expect((out[0] as CommandStep).speech).toEqual({ text: 'hi', untilDone: true })
  })

  it('test_prepare_reaches_nested_speech_in_if_else_and_repeat', async () => {
    const steps: Step[] = [
      { kind: 'repeat', blockId: 'r', times: 2, label: 'Repeat', body: [speak('a')] },
      { kind: 'repeatUntil', blockId: 'ru', condition: { kind: 'fallen' }, label: 'RU', body: [speak('b')] },
      { kind: 'if', blockId: 'i', condition: { kind: 'standing' }, label: 'If', then: [speak('c')], else: [speak('d')] },
    ]
    const out = await prepareRunSteps(steps, 'r1', clipper())
    const ids = JSON.stringify(out).match(/clip-\w/g)
    expect(ids).toEqual(['clip-a', 'clip-b', 'clip-c', 'clip-d'])
  })

  it('test_prepare_fails_with_the_step_label_when_a_clip_cannot_be_made', async () => {
    const boom = new Error('tts down')
    const make = vi.fn(async () => { throw boom })
    const err = await prepareRunSteps([walk, speak('x', 'Say hello')], 'r1', make).catch((e) => e)
    expect(err).toBeInstanceOf(PrepareFailed)
    expect(err.stepLabel).toBe('Say hello')
    expect(err.cause).toBe(boom)
  })

  it('test_prepare_leaves_steps_without_speech_untouched', async () => {
    const make = clipper()
    const steps: Step[] = [walk, { kind: 'wait', blockId: 'x', seconds: 1, label: 'Wait' }]
    const out = await prepareRunSteps(steps, 'r1', make)
    expect(out).toEqual(steps)
    expect(make).not.toHaveBeenCalled()
  })
})

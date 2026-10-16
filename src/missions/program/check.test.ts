import { describe, expect, it } from 'vitest'
import { checkProgram, programStepCount } from './check'
import type { Step } from './types'

const move = (distance = 1, id = 'm'): Step => ({ kind: 'command', blockId: id, type: 'LINE_WALK', params: { direction: 'forward', distance }, label: 'Move' })
const pose: Step = { kind: 'command', blockId: 'p', type: 'DYNAMIC_POSE', params: { duration: 2, roll_deg: 0, pitch_deg: 0, yaw_deg: 0, height_m: 0 }, label: 'Pose', quadOnly: true }
const codes = (steps: Step[], type: 'quad' | 'wheel' | null = 'quad') => checkProgram(steps, type).map((i) => i.code)

describe('checkProgram', () => {
  it('flags an empty program', () => {
    expect(checkProgram([], 'quad')[0]).toMatchObject({ severity: 'error', code: 'programEmpty' })
  })

  it('passes a valid short program', () => {
    expect(checkProgram([move(), pose], 'quad')).toEqual([])
  })

  it('flags quad-only steps on a wheel robot, with the block id, but not when the type is unknown', () => {
    expect(checkProgram([pose], 'wheel')[0]).toMatchObject({ severity: 'error', code: 'blockNotForRobot', blockId: 'p' })
    expect(codes([pose], null)).toEqual([])
  })

  it('flags numbers outside the block limits', () => {
    expect(checkProgram([move(5, 'far')], 'quad')[0]).toMatchObject({ severity: 'error', code: 'valueOutOfRange', blockId: 'far' })
    const nested: Step = { kind: 'repeat', blockId: 'r', times: 101, body: [move()], label: 'Repeat' }
    expect(codes([nested])).toEqual(['valueOutOfRange'])
  })

  it('flags a missing condition inside nested steps', () => {
    const s: Step = { kind: 'if', blockId: 'i', condition: { kind: 'missing' }, then: [], else: [move()], label: 'If' }
    expect(checkProgram([s], 'quad')[0]).toMatchObject({ severity: 'error', code: 'conditionMissing', blockId: 'i' })
  })

  it('warns when the static command count exceeds 500', () => {
    const inner: Step = { kind: 'repeat', blockId: 'in', times: 10, body: [move()], label: 'r' }
    const outer: Step = { kind: 'repeat', blockId: 'out', times: 100, body: [inner], label: 'r' }
    expect(programStepCount([outer])).toBe(1000)
    expect(checkProgram([outer], 'quad')).toMatchObject([{ severity: 'warning', code: 'programTooLong' }])
  })

  it('counts repeat-until as 100 rounds and an if as its longer branch', () => {
    const until: Step = { kind: 'repeatUntil', blockId: 'u', condition: { kind: 'fallen' }, body: [move(), move()], label: 'u' }
    expect(programStepCount([until])).toBe(200)
    const iff: Step = { kind: 'if', blockId: 'i', condition: { kind: 'fallen' }, then: [move()], else: [move(), move()], label: 'i' }
    expect(programStepCount([iff])).toBe(2)
  })
})

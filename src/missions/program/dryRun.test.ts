import { describe, expect, it } from 'vitest'
import type { RobotState } from '@/types'
import { dryRun, evaluate } from './dryRun'
import type { CommandStep, Step } from './types'

const c = (id: string, type: string, params: Record<string, unknown> = {}): CommandStep =>
  ({ kind: 'command', blockId: id, type, params, label: id }) as CommandStep

const robot = (over: Record<string, unknown> = {}) =>
  ({ abstract_state: 'STAND', posture: 'upright', battery: { percent: 80 }, speed_ratio: 50, obstacle_avoidance: false, ...over }) as unknown as RobotState

describe('dryRun', () => {
  it('totals stand, move 1 m, rotate 90, move 0.5 m', () => {
    const steps: Step[] = [
      c('s', 'SET_STATE', { state: 'stand' }),
      c('m1', 'LINE_WALK', { distance: 1 }),
      c('r', 'ROTATE', { angle: 90 }),
      c('m2', 'LINE_WALK', { distance: 0.5 }),
    ]
    const r = dryRun(steps, robot())
    expect(r.metresWalked).toBe(1.5)
    expect(r.commands).toBe(4)
    // ratio 50 -> 0.25 m/s: 4 s + 2 s (rotate) + 2 s
    expect(r.seconds).toBeCloseTo(4 + 2 + 2)
  })

  it('tracks SET_SPEED_RATIO while walking the tree', () => {
    const r = dryRun([c('a', 'SET_SPEED_RATIO', { ratio: 100 }), c('m', 'LINE_WALK', { distance: 1 })], robot())
    expect(r.seconds).toBeCloseTo(2)
  })

  it('counts waits and repeats', () => {
    const r = dryRun([{ kind: 'repeat', blockId: 'r', label: 'r', times: 3, body: [{ kind: 'wait', blockId: 'w', label: 'w', seconds: 2 }, c('x', 'STAND_UP')] }], robot())
    expect(r.seconds).toBe(6)
    expect(r.commands).toBe(3)
  })

  it('warns instead of iterating a repeatUntil that cannot change', () => {
    const r = dryRun([{ kind: 'repeatUntil', blockId: 'u', label: 'u', condition: { kind: 'fallen' }, body: [c('x', 'STAND_UP')] }], robot())
    expect(r.commands).toBe(1)
    expect(r.warnings).toEqual([{ code: 'repeatUntilUnresolved', label: 'u' }])
  })

  it('warns when battery is unknown', () => {
    const r = dryRun([{ kind: 'if', blockId: 'i', label: 'i', condition: { kind: 'batteryBelow', pct: 20 }, then: [c('t', 'STAND_UP')], else: [] }], robot({ battery: { percent: null } }))
    expect(r.commands).toBe(0)
    expect(r.warnings.some((w) => w.code === 'batteryUnknown')).toBe(true)
  })

  it('a false waitUntil adds its 120 s timeout as an upper bound', () => {
    const r = dryRun([{ kind: 'waitUntil', blockId: 'w', label: 'w', condition: { kind: 'fallen' } }], robot())
    expect(r.seconds).toBe(120)
    expect(r.warnings).toEqual([{ code: 'waitUntilUnresolved', label: 'w' }])
  })

  it('a missing condition warns and ends the walk', () => {
    const r = dryRun([
      { kind: 'if', blockId: 'i', label: 'i', condition: { kind: 'missing' }, then: [], else: [c('e', 'STAND_UP')] },
      c('after', 'STAND_UP'),
    ], robot())
    expect(r.commands).toBe(0)
    expect(r.warnings).toEqual([{ code: 'conditionMissing', label: 'i' }])
  })

  it('clamps repeat times to 100', () => {
    const r = dryRun([{ kind: 'repeat', blockId: 'r', label: 'r', times: 1000, body: [c('x', 'STAND_UP')] }], robot())
    expect(r.commands).toBe(100)
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

import { describe, expect, it } from 'vitest'
import type { MissionEstimates, MissionLibraryEntry, MissionWaypoint } from '@/types'
import { LIMITS, type Step } from './program/types'
import { computeEstimates, DEFAULT_SPEED_MPS } from './estimates'

const wp = (id: string, x: number, y: number): MissionWaypoint =>
  ({ waypoint_id: id, label: id, x_m: x, y_m: y, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' })

const base: MissionLibraryEntry = {
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  waypoints: [], segments: [],
}
const route = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry =>
  ({ ...base, waypoints: [wp('a', 0, 0), wp('b', 10, 0)], ...patch })
const program = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry =>
  ({ ...base, kind: 'program', program_state: '{}', ...patch })

const walk = (id: string, distance: number): Step =>
  ({ kind: 'command', blockId: id, type: 'LINE_WALK', params: { distance }, label: id })

const stored: MissionEstimates = { length_m: 7, duration_s: 99, energy_wh: null, duration_bounded: true }

describe('computeEstimates, route kind', () => {
  it('walks the waypoints and stays bounded', () => {
    const e = computeEstimates(route())
    expect(e.length_m).toBe(10)
    expect(e.duration_s).toBeCloseTo(10 / DEFAULT_SPEED_MPS)
    expect(e.duration_bounded).toBe(true)
  })

  it('ignores a supplied program and any stored estimate: geometry is the truth for a route', () => {
    const e = computeEstimates(route({ estimates: stored }), [walk('w', 100)])
    expect(e.length_m).toBe(10)
  })
})

describe('computeEstimates, program kind', () => {
  it('takes length and duration from the dry run, not from geometry', () => {
    // The stray waypoints would give 10 m if geometry were read.
    const m = program({ waypoints: [wp('a', 0, 0), wp('b', 10, 0)] })
    const e = computeEstimates(m, [walk('w', 2)])
    // 2 m at the assumed 10% speed ratio is 2 / (0.5 * 0.1) = 40 s.
    expect(e.length_m).toBe(2)
    expect(e.duration_s).toBeCloseTo(40)
    expect(e.energy_wh).toBeNull()
  })

  it('bounds a program whose every wait and loop resolves', () => {
    const steps: Step[] = [
      walk('w', 1),
      { kind: 'wait', blockId: 'x', seconds: 5, label: 'wait' },
      { kind: 'repeat', blockId: 'r', times: 3, body: [walk('w2', 1)], label: 'r' },
    ]
    expect(computeEstimates(program(), steps).duration_bounded).toBe(true)
  })

  it('marks a program with an unresolved repeat-until as unbounded', () => {
    const steps: Step[] = [{ kind: 'repeatUntil', blockId: 'r', condition: { kind: 'fallen' }, body: [walk('w', 1)], label: 'r' }]
    expect(computeEstimates(program(), steps).duration_bounded).toBe(false)
  })

  it('keeps a wait-until bounded: the runner halts it at the cap, and the figure already includes the cap', () => {
    const steps: Step[] = [{ kind: 'waitUntil', blockId: 'u', condition: { kind: 'standing' }, label: 'u' }]
    const e = computeEstimates(program(), steps)
    expect(e.duration_bounded).toBe(true)
    expect(e.duration_s).toBe(LIMITS.waitUntilSeconds)
  })

  it('marks a program that hits the command limit as unbounded', () => {
    const steps: Step[] = [{ kind: 'repeat', blockId: 'r', times: 100, body: Array.from({ length: 6 }, (_, i) => walk(`w${i}`, 0.1)), label: 'r' }]
    expect(computeEstimates(program(), steps).duration_bounded).toBe(false)
  })

  it('reports an empty program as zero, bounded', () => {
    expect(computeEstimates(program(), [])).toMatchObject({ length_m: 0, duration_s: 0, duration_bounded: true })
  })
})

describe('computeEstimates, program kind with an if', () => {
  // With no robot an if cannot be decided, so the estimate must cover the
  // longer branch: a shorter figure reported as bounded would pass the very
  // gate duration_bounded exists to guard.
  const cond = { kind: 'fallen' } as const
  const iff = (id: string, then: Step[], other: Step[]): Step =>
    ({ kind: 'if', blockId: id, condition: cond, then, else: other, label: id })
  // 1 m is 20 s at the assumed ratio.
  const m = (n: number, id: string): Step[] => Array.from({ length: n }, (_, i) => walk(`${id}${i}`, 1))

  it('takes the figure of equal branches', () => {
    const e = computeEstimates(program(), [iff('i', m(2, 't'), m(2, 'e'))])
    expect(e.duration_s).toBeCloseTo(40)
    expect(e.length_m).toBe(2)
    expect(e.duration_bounded).toBe(true)
  })

  it('takes the then branch when it is longer', () => {
    const e = computeEstimates(program(), [iff('i', m(3, 't'), m(1, 'e'))])
    expect(e.duration_s).toBeCloseTo(60)
    expect(e.length_m).toBe(3)
  })

  it('takes the else branch when it is longer', () => {
    const e = computeEstimates(program(), [iff('i', m(1, 't'), m(3, 'e'))])
    expect(e.duration_s).toBeCloseTo(60)
    expect(e.length_m).toBe(3)
  })

  it('adds what follows the if to the longer branch only', () => {
    const e = computeEstimates(program(), [iff('i', m(3, 't'), m(1, 'e')), walk('after', 1)])
    expect(e.duration_s).toBeCloseTo(80)
    expect(e.length_m).toBe(4)
  })

  it('takes the longer branch at every level of nesting', () => {
    // then: 1 walk; else: an if whose then is 1 walk and whose else is 4.
    const inner = iff('in', m(1, 'it'), m(4, 'ie'))
    const e = computeEstimates(program(), [iff('out', m(1, 't'), [inner])])
    expect(e.duration_s).toBeCloseTo(80)
    // and the other way round: the outer then holds the nested if.
    const e2 = computeEstimates(program(), [iff('out', [inner], m(1, 'e'))])
    expect(e2.duration_s).toBeCloseTo(80)
  })

  it('still flags a repeat-until in the branch that is not the longer', () => {
    const loop: Step = { kind: 'repeatUntil', blockId: 'r', condition: cond, body: [], label: 'r' }
    expect(computeEstimates(program(), [iff('i', m(3, 't'), [loop])]).duration_bounded).toBe(false)
  })
})

describe('computeEstimates, program kind without a compiled program', () => {
  it('returns the stored estimate, not nulls: the library and calendar call it without Blockly', () => {
    expect(computeEstimates(program({ estimates: stored }))).toEqual(stored)
  })

  it('keeps a stored unbounded flag', () => {
    expect(computeEstimates(program({ estimates: { ...stored, duration_bounded: false } })).duration_bounded).toBe(false)
  })

  it('treats a stored estimate with no duration_bounded as unbounded, not bounded', () => {
    // A mission saved by an older console. The backend refuses to queue an
    // unbounded program with no cap; reading undefined as true would walk
    // straight through that gate on a value nobody computed.
    const old = { length_m: 7, duration_s: 99, energy_wh: null } as unknown as MissionEstimates
    const e = computeEstimates(program({ estimates: old }))
    expect(e.duration_bounded).toBe(false)
    expect(e.duration_s).toBe(99)
    expect(e.length_m).toBe(7)
  })

  it('treats a program with no stored estimate at all as unbounded, with unknown figures', () => {
    expect(computeEstimates(program())).toEqual({ length_m: null, duration_s: null, energy_wh: null, duration_bounded: false })
  })

  it('never reads the geometry of a stray waypoint list', () => {
    const m = program({ waypoints: [wp('a', 0, 0), wp('b', 10, 0)], estimates: stored })
    expect(computeEstimates(m)).toEqual(stored)
  })
})

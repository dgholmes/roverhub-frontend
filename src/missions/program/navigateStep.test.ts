import { describe, expect, it, vi } from 'vitest'
import { checkProgram, programStepCount } from './check'
import { dryRun } from './dryRun'
import { prepareRunSteps } from './prepareRun'
import type { NavStep, Step } from './types'

/** A route's leg as the backend compiles it (shared NavStep, 0.0.16). Every
 * walker over steps must take one in its stride: the console meets them in a
 * run's record and in the mock's simulated route runs. */
const leg: NavStep = {
  kind: 'navigate', blockId: 'wp:w1:go', label: 'Gate B', waypointId: 'w1',
  goal: { x_m: 3, y_m: 4, yaw_rad: null, map_id: 'map-a', floor_id: '0' },
  toleranceM: 0.5, maxSeconds: 120, retries: 2, retryWaitS: 5, maxSpeedMps: null,
}
const nested: Step[] = [{ kind: 'repeat', blockId: 'r', times: 2, body: [leg], label: 'Repeat 2' }]

describe('a navigate step', () => {
  it('raises no program issue: the backend compiled and checked it', () => {
    expect(checkProgram([leg, ...nested], 'quad')).toEqual([])
  })

  it('counts as one command sent (its NAV_GOTO), nested ones as their repeats', () => {
    expect(programStepCount([leg])).toBe(1)
    expect(programStepCount(nested)).toBe(2)
  })

  it('is walked by the dry run, counted, and bounded by its time cap', () => {
    const out = dryRun([leg], undefined)
    expect(out.log.map((e) => e.blockId)).toContain('wp:w1:go')
    expect(out.commands).toBe(1)
    expect(out.seconds).toBe(120)
    expect(out.warnings).toEqual([])
  })

  it('passes through run preparation unchanged, needing no clip', async () => {
    const makeClip = vi.fn()
    expect(await prepareRunSteps([leg, ...nested], 'robot-1', makeClip)).toEqual([leg, ...nested])
    expect(makeClip).not.toHaveBeenCalled()
  })
})

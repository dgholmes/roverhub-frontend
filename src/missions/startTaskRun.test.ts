import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask } from '@/types'
import { RunStartRefused } from '@/lib/realtime/runStart'
import { startTaskRun } from './startTaskRun'

const program = JSON.stringify({ blocks: { languageVersion: 0, blocks: [
  { type: 'rh_start', id: 'start', x: 30, y: 30, deletable: false, next: { block: { type: 'rh_speak', id: 'b1', fields: { TEXT: 'hello', UNTIL_DONE: 'once', VOLUME: 70 } } } },
] } })
const mission = (over: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm1', name: 'Lights', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 'site-a', waypoints: [], segments: [], program_state: program, ...over,
})
const task: MissionTask = {
  task_id: 't1', mission_id: 'm1', site_id: 'site-a', name: null, robot_id: 'r1', schedule: null,
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'op', created_at: '', updated_at: '', version: 1,
}
const deps = (over = {}) => ({
  runTaskNow: vi.fn(async () => ({ occurrence: {}, run: { run_id: 'run-9' } }) as never),
  makeClip: vi.fn(async () => ({ clip_id: 'c1' })),
  robotType: () => 'quad' as const,
  ...over,
})

describe('startTaskRun', () => {
  it('test_run_now_compiles_for_the_robot_type_and_posts_steps', async () => {
    const d = deps()
    const r = await startTaskRun(d, task, mission())
    expect(r).toEqual({ ok: true, robotId: 'r1', runId: 'run-9' })
    expect(d.runTaskNow).toHaveBeenCalledTimes(1)
    const [id, steps] = d.runTaskNow.mock.calls[0] as unknown as [string, { kind: string }[]]
    expect(id).toBe('t1')
    expect(steps.length).toBeGreaterThan(0)
  })

  it('test_run_now_makes_clips_before_posting', async () => {
    const order: string[] = []
    const d = deps({
      makeClip: vi.fn(async () => { order.push('clip'); return { clip_id: 'c1' } }),
      runTaskNow: vi.fn(async () => { order.push('post'); return { occurrence: {}, run: { run_id: 'x' } } as never }),
    })
    await startTaskRun(d, task, mission())
    expect(order).toEqual(['clip', 'post'])
  })

  it('test_run_now_refusal_stays_on_page', async () => {
    const d = deps({ runTaskNow: vi.fn(async () => { throw new RunStartRefused('Robot is in E-Stop.', 409) }) })
    expect(await startTaskRun(d, task, mission())).toEqual({ ok: false, reason: 'Robot is in E-Stop.' })
  })

  it('test_run_now_without_a_program_explains', async () => {
    const d = deps()
    const r = await startTaskRun(d, task, mission({ program_state: undefined }))
    expect(r).toEqual({ ok: false, reason: 'This mission has no program to run.' })
    expect(d.runTaskNow).not.toHaveBeenCalled()
  })

  it('refuses when the robot type is not known', async () => {
    const d = deps({ robotType: () => null })
    expect(await startTaskRun(d, task, mission())).toEqual({ ok: false, reason: "The robot's type is not known yet; wait for it to come online." })
    expect(d.runTaskNow).not.toHaveBeenCalled()
  })

  it('names the step when a clip cannot be made', async () => {
    const d = deps({ makeClip: vi.fn(async () => { throw new Error('boom') }) })
    const r = await startTaskRun(d, task, mission())
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/^Could not make the speech for /)
    expect(d.runTaskNow).not.toHaveBeenCalled()
  })
})

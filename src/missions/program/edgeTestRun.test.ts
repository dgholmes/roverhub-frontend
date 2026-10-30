import { describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { RunStartRefused } from '@/lib/realtime/runStart'
import type { RobotRunView } from '@/liveops/robotRun'
import type { MissionLibraryEntry, RunEvent, RunEventKind } from '@/types'
import { startTestRun, testRunModel, type TestRunInput } from './edgeTestRun'
import { logLinesFromEvents } from './runLog'
import type { ProgramBlock } from './types'

let seq = 0
const ev = (kind: RunEventKind, over: Partial<RunEvent> = {}): RunEvent => ({
  run_id: 'run-1', seq: ++seq, at: new Date(1_000_000 + seq * 1000).toISOString(), kind,
  waypoint_id: null, task_index: null, actor: null, media: null, position: null, detection: null,
  message: null, block_id: null, result: null, reason: null, snapshot_id: null, ...over,
})
const t = i18n.getFixedT('en')

describe('logLinesFromEvents', () => {
  it('test_log_lines_from_step_events', () => {
    const lines = logLinesFromEvents([
      ev('run_started'),
      ev('step_started', { block_id: 'a', message: 'Walk forward 1 m' }),
      ev('step_done', { block_id: 'a', message: 'Walk forward 1 m' }),
      ev('step_started', { block_id: 'b', message: 'Rotate left 90°' }),
      ev('step_failed', { block_id: 'b', message: 'Rotate left 90°', reason: 'commandFailed' }),
      ev('step_skipped', { block_id: 'c', message: 'Take a snapshot', reason: 'stopped' }),
    ], t)
    expect(lines.map((l) => [l.blockId, l.label, l.result])).toEqual([
      ['a', 'Walk forward 1 m', 'done'],
      ['b', 'Rotate left 90°', 'failed'],
      ['c', 'Take a snapshot', 'skipped'],
    ])
    expect(lines[1].detail).toBe('a command failed')
  })

  it('test_log_lines_ignore_redelivered_and_out_of_order_events', () => {
    const start = ev('step_started', { block_id: 'a', message: 'A' })
    const done = ev('step_done', { block_id: 'a', message: 'A' })
    const lines = logLinesFromEvents([done, start, start], t)
    expect(lines.map((l) => [l.blockId, l.result])).toEqual([['a', 'done']])
  })

  it('test_paused_and_resumed_lines', () => {
    const lines = logLinesFromEvents([
      ev('step_started', { block_id: 'a', message: 'A' }),
      ev('paused', { message: 'A' }),
      ev('resumed'),
    ], t)
    expect(lines.map((l) => l.result)).toEqual(['running', 'paused', 'resumed'])
    expect(lines[1].label).toBe(t('missions.program.run.log.paused'))
    expect(lines[2].label).toBe(t('missions.program.run.log.resumed'))
  })

  it('test_run_ended_line_carries_reason_text', () => {
    const lines = logLinesFromEvents([
      ev('step_started', { block_id: 'a', message: 'A' }),
      ev('step_skipped', { block_id: 'a', message: 'A', reason: 'stopped' }),
      ev('run_ended', { result: 'aborted', reason: 'stopped' }),
    ], t)
    const end = lines[lines.length - 1]
    expect(end.result).toBe('cancelled')
    expect(end.label).toBe(t('missions.program.run.log.ended.aborted'))
    expect(end.detail).toBe('stopped by the operator')
    // A reason this build does not know is shown as sent.
    const odd = logLinesFromEvents([ev('run_ended', { result: 'failed', reason: 'mystery thing' })], t)
    expect(odd[0].detail).toBe('mystery thing')
  })
})

const view = (over: Partial<NonNullable<RobotRunView>> = {}): RobotRunView => ({
  phase: 'running', runId: 'run-1', missionName: 'M', stepLabel: 'A', blockId: 'a', redoStepLabel: null,
  startedAt: '', owner: 'mission:run-1', youHoldControl: false, estimateS: null, ...over,
})
const input = (over: Partial<TestRunInput> = {}): TestRunInput => ({
  starting: false, runId: null, refusal: null, events: [], view: null, seenOnRobot: false, ...over,
})

describe('testRunModel', () => {
  it('is idle before a run, starting while it starts, then follows the robot', () => {
    expect(testRunModel(input()).state).toBe('idle')
    expect(testRunModel(input({ starting: true })).state).toBe('starting')
    // Accepted, but /state has not said so yet.
    expect(testRunModel(input({ runId: 'run-1' })).state).toBe('running')
    const m = testRunModel(input({ runId: 'run-1', view: view({ phase: 'paused', blockId: 'b' }), seenOnRobot: true }))
    expect(m.state).toBe('paused')
    expect(m.blockId).toBe('b')
  })

  it('ends on our run_ended, or when the robot stops showing our run', () => {
    const ended = testRunModel(input({ runId: 'run-1', events: [ev('run_ended', { result: 'completed' })] }))
    expect(ended.state).toBe('ended')
    expect(ended.ended?.result).toBe('completed')
    expect(ended.blockId).toBeNull()
    expect(testRunModel(input({ runId: 'run-1', view: null, seenOnRobot: true })).state).toBe('ended')
    // Another run on the robot is not ours.
    expect(testRunModel(input({ runId: 'run-1', view: view({ runId: 'run-2' }), seenOnRobot: true })).state).toBe('ended')
  })

  it('test_refusal_is_kept_for_the_bar', () => {
    const m = testRunModel(input({ refusal: 'r1 is offline' }))
    expect(m.state).toBe('idle')
    expect(m.refusal).toBe('r1 is offline')
  })
})

const savedProgram = JSON.stringify({ blocks: { languageVersion: 0, blocks: [
  { type: 'rh_start', id: 'start', x: 0, y: 0, next: { block: { type: 'rh_wait', id: 'saved-wait', fields: { SECONDS: 3 } } } },
] } })
const mission: MissionLibraryEntry = {
  mission_id: 'm1', name: 'Lights', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 'site-a', waypoints: [], segments: [], program_state: savedProgram,
}
const editorBlocks: ProgramBlock[] = [{ id: 'unsaved-move', type: 'rh_move', fields: { DIRECTION: 'forward', DISTANCE: 1 }, inputs: {} }]
const deps = (over = {}) => ({
  startRun: vi.fn(async () => ({ run: { run_id: 'run-7' } }) as never),
  makeClip: vi.fn(async () => ({ clip_id: 'c1' })),
  ...over,
})

describe('startTestRun', () => {
  it('test_test_run_uses_unsaved_editor_program', async () => {
    const d = deps()
    const r = await startTestRun(d, { mission, robotId: 'r1', robotType: 'quad', editorBlocks })
    expect(r).toEqual({ ok: true, runId: 'run-7' })
    const [robotId, req] = d.startRun.mock.calls[0] as unknown as [string, { steps: { blockId: string }[]; source: string; mission: MissionLibraryEntry }]
    expect(robotId).toBe('r1')
    expect(req.source).toBe('editor')
    expect(req.mission).toBe(mission)
    expect(req.steps.map((s) => s.blockId)).toEqual(['unsaved-move'])
  })

  it('test_refusal_is_returned_as_the_backends_sentence', async () => {
    const d = deps({ startRun: vi.fn(async () => { throw new RunStartRefused('r1 is offline', 409) }) })
    expect(await startTestRun(d, { mission, robotId: 'r1', robotType: 'quad', editorBlocks })).toEqual({ ok: false, reason: 'r1 is offline' })
  })

  it('test_a_failed_clip_names_the_step_and_posts_nothing', async () => {
    const speak: ProgramBlock[] = [{ id: 's', type: 'rh_speak', fields: { TEXT: 'hello', UNTIL_DONE: 'once', VOLUME: 70 }, inputs: {} }]
    const d = deps({ makeClip: vi.fn(async () => { throw new Error('tts down') }) })
    const r = await startTestRun(d, { mission, robotId: 'r1', robotType: 'quad', editorBlocks: speak })
    expect(r.ok).toBe(false)
    expect(d.startRun).not.toHaveBeenCalled()
  })
})

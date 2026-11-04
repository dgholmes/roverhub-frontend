import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command, MissionLibraryEntry, RobotState, RunEvent } from '@/types'
import type { Step } from '@/missions/program/types'
import type { mockDataProvider as MockProvider } from './mockDataProvider'

// The mock's simulated run is what mock-mode LiveOps shows while a mission
// runs (spec §10): steps advance on a timer, and take control and release do
// what they do on the bridge. A fresh module per test, because the provider is
// a singleton holding robots and runs.

const ROBOT = 'zaezae-x1-002'
const STEP_MS = 1500
/** A command walks seven stages at 350 ms each before its side effects land. */
const COMMAND_MS = 7 * 350

const mission = { mission_id: 'm-loop', name: 'Lobby loop', kind: 'program', site_id: 'site-north-yard' } as unknown as MissionLibraryEntry
const steps: Step[] = [
  { kind: 'wait', blockId: 'b1', seconds: 1, label: 'Wait 1 s' },
  { kind: 'command', blockId: 'b2', type: 'LINE_WALK', params: {}, label: 'Walk 1 m' },
]

let provider: typeof MockProvider

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  provider = (await import('./mockDataProvider')).mockDataProvider
})

afterEach(() => { vi.useRealTimers() })

const robot = (): RobotState => provider.getRobots().find((r) => r.robot_id === ROBOT)!

function send(type: Command['type'], params?: Record<string, unknown>): Command[] {
  const seen: Command[] = []
  provider.dispatchCommand(ROBOT, type, type, (c) => seen.push(c), params)
  vi.advanceTimersByTime(COMMAND_MS)
  return seen
}

async function start(): Promise<{ events: RunEvent[]; runId: string }> {
  const events: RunEvent[] = []
  provider.subscribeRunEvents(ROBOT, (e) => events.push(e))
  const { run } = await provider.startRun(ROBOT, { mission, steps, source: 'editor' })
  return { events, runId: run.run_id }
}

const kinds = (events: RunEvent[]) => events.map((e) => e.kind)

describe('the mock simulated run', () => {
  it('test_mock_run_advances_steps_and_completes', async () => {
    const { events, runId } = await start()
    expect(robot()).toMatchObject({ abstract_state: 'AUTO_MISSION', control_owner: `mission:${runId}` })
    expect(robot().active_run).toMatchObject({ run_id: runId, status: 'running' })
    expect(kinds(events)).toEqual(['run_started'])

    vi.advanceTimersByTime(STEP_MS)
    expect(events[1]).toMatchObject({ kind: 'step_started', block_id: 'b1', message: 'Wait 1 s' })
    expect(robot().active_run).toMatchObject({ step_label: 'Wait 1 s', block_id: 'b1' })

    vi.advanceTimersByTime(STEP_MS * 4)
    expect(kinds(events)).toEqual(['run_started', 'step_started', 'step_done', 'step_started', 'step_done', 'run_ended'])
    expect(events[5]).toMatchObject({ result: 'completed' })
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(robot()).toMatchObject({ active_run: null, control_owner: null })
    expect(robot().abstract_state).not.toBe('AUTO_MISSION')

    // Stored like any other run, so Data › Missions lists it.
    expect((await provider.getRun(runId)).run).toMatchObject({ result: 'completed', source: 'editor', mission_id: 'm-loop' })
    expect(kinds(await provider.getRunEvents(runId))).toEqual(kinds(events))
  })

  it('test_mock_take_control_pauses_and_resume_redoes', async () => {
    const { events } = await start()
    vi.advanceTimersByTime(STEP_MS * 3) // step 1 done, step 2 started
    expect(events[events.length - 1]).toMatchObject({ kind: 'step_started', block_id: 'b2' })

    send('TAKE_CONTROL', { operator: 'operator-dev' })
    expect(robot().control_owner).toBe('operator-dev')
    expect(robot().active_run).toMatchObject({ status: 'paused', redo_step_label: 'Walk 1 m' })
    expect(events[events.length - 1]).toMatchObject({ kind: 'paused' })
    const pausedAt = events.length
    vi.advanceTimersByTime(STEP_MS * 5)
    expect(events).toHaveLength(pausedAt) // nothing advances while paused

    send('RELEASE_CONTROL', { resume_run: true })
    expect(robot().active_run).toMatchObject({ status: 'running', redo_step_label: null })
    expect(robot().control_owner).toMatch(/^mission:/)
    expect(events[pausedAt]).toMatchObject({ kind: 'resumed' })
    vi.advanceTimersByTime(STEP_MS)
    // The interrupted step is started again, not skipped.
    expect(events[pausedAt + 1]).toMatchObject({ kind: 'step_started', block_id: 'b2' })
    vi.advanceTimersByTime(STEP_MS * 2)
    expect(events[events.length - 1]).toMatchObject({ kind: 'run_ended', result: 'completed' })
  })

  it('test_mock_plain_release_leaves_run_paused_with_no_owner', async () => {
    const { events } = await start()
    vi.advanceTimersByTime(STEP_MS)
    send('TAKE_CONTROL', { operator: 'operator-dev' })
    send('RELEASE_CONTROL')
    expect(robot().control_owner).toBeNull()
    expect(robot().active_run).toMatchObject({ status: 'paused' })
    vi.advanceTimersByTime(STEP_MS * 5)
    expect(events[events.length - 1]).toMatchObject({ kind: 'paused' })
  })

  it('test_mock_stop_mission_ends_stopped', async () => {
    const { events, runId } = await start()
    vi.advanceTimersByTime(STEP_MS)
    send('STOP_MISSION', { run_id: runId })
    expect(events[events.length - 1]).toMatchObject({ kind: 'run_ended', result: 'aborted', reason: 'stopped' })
    expect(robot()).toMatchObject({ active_run: null, control_owner: null })
    vi.advanceTimersByTime(STEP_MS * 5)
    expect(events[events.length - 1]).toMatchObject({ kind: 'run_ended' })
    expect((await provider.getRun(runId)).run).toMatchObject({ result: 'aborted', end_reason: 'stopped' })
  })

  it('ends the run on E-Stop, and refuses a second start while one runs', async () => {
    const { events } = await start()
    await expect(provider.startRun(ROBOT, { mission, steps, source: 'editor' })).rejects.toMatchObject({ name: 'RunStartRefused', status: 409 })
    send('ESTOP')
    expect(events[events.length - 1]).toMatchObject({ kind: 'run_ended', result: 'aborted', reason: 'estop' })
    expect(robot()).toMatchObject({ abstract_state: 'E_STOP', active_run: null })
  })

  it('ends the run the moment E-Stop is pressed, not after its ack walk', async () => {
    const { events } = await start()
    provider.dispatchCommand(ROBOT, 'ESTOP', 'ESTOP', () => {})
    expect(events[events.length - 1]).toMatchObject({ kind: 'run_ended', reason: 'estop' })
    expect(robot().active_run).toBeNull()
    const ended = events.length
    vi.advanceTimersByTime(STEP_MS * 5)
    expect(events).toHaveLength(ended)
  })

  it('stops beating once disposed', async () => {
    const { events } = await start()
    provider.dispose()
    vi.advanceTimersByTime(STEP_MS * 5)
    expect(kinds(events)).toEqual(['run_started'])
  })

  it('refuses Release while the run is executing, as the bridge does', async () => {
    await start()
    const seen = send('RELEASE_CONTROL')
    expect(seen[seen.length - 1]).toMatchObject({ current_stage: 'execution_failed' })
    expect(seen[seen.length - 1].failure_reason).toMatch(/^REJECTED_MISSION_HOLDS_CONTROL/)
    expect(robot().active_run).toMatchObject({ status: 'running' })
  })
})

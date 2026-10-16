import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry } from '@/types'
import type { StepResult } from './run'
import { makeRunId, startRunRecord } from './runRecord'

const RUN_ID_RE = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,160}$/
const NOW = Date.UTC(2026, 9, 16, 8, 5, 3)
const mission = { mission_id: 'prog-1', name: 'p' } as MissionLibraryEntry
const robot = { robot_id: 'zaezae-x1-001', site_id: 'site-a' }

describe('runRecord', () => {
  it('builds a backend-valid run id', () => {
    const id = makeRunId('prog 1/x', 'robot:01', NOW)
    expect(id).toBe('20261016-080503-prog-1-x-robot-01')
    expect(RUN_ID_RE.test(id)).toBe(true)
    expect(id).not.toContain(':')
  })
  it('caps the id at 160 chars', () => {
    const id = makeRunId('m'.repeat(300), 'r', NOW)
    expect(id.length).toBeLessThanOrEqual(160)
    expect(RUN_ID_RE.test(id)).toBe(true)
  })
  it('maps log entries to event kinds with seq', () => {
    const rec = startRunRecord(mission, robot, 'operator-dev', NOW)
    expect(rec.run.result).toBe('running')
    expect(rec.startedEvent()).toMatchObject({ seq: 0, kind: 'run_started', run_id: rec.run.run_id })
    const e = (result: StepResult | 'started', detail?: string) =>
      rec.event({ at: NOW + 1000, blockId: 'b', label: 'Stand', result, detail }, 1)
    expect(e('started')).toBeNull()
    expect(e('done')).toMatchObject({ kind: 'task_done', message: 'Stand', seq: 1 })
    expect(e('skipped')?.kind).toBe('task_skipped')
    expect(e('failed', 'timeout')).toMatchObject({ kind: 'alert', message: 'Stand: timeout' })
    expect(e('cancelled')).toMatchObject({ kind: 'alert', message: 'Stand' })
    expect(e('unknown')?.kind).toBe('alert')
    expect(e('done')?.waypoint_id).toBeNull()
  })
  it('finishes the run and ends the stream', () => {
    const rec = startRunRecord(mission, robot, 'operator-dev', NOW)
    const out = { result: 'aborted' as const, reason: 'stopped' as const, commandsSent: 2 }
    const done = rec.finish(out, NOW + 5000)
    expect(done).toMatchObject({ result: 'aborted', end_reason: 'stopped', ended_at: new Date(NOW + 5000).toISOString() })
    expect(rec.endedEvent(out, 4, NOW + 5000)).toMatchObject({ kind: 'run_ended', message: 'stopped', seq: 4 })
    expect(rec.endedEvent({ result: 'completed', commandsSent: 1 }, 2, NOW).message).toBeNull()
  })
})

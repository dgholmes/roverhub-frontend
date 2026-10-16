import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry } from '@/types'
import type { StepResult } from './run'
import { makeRunId, recordSink, startRunRecord } from './runRecord'

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
  it('maps log entries to event kinds and numbers them itself', () => {
    const rec = startRunRecord(mission, robot, 'operator-dev', NOW)
    expect(rec.run.result).toBe('running')
    expect(rec.startedEvent()).toMatchObject({ seq: 0, kind: 'run_started', run_id: rec.run.run_id })
    const e = (result: StepResult | 'started', detail?: string) =>
      rec.event({ at: NOW + 1000, blockId: 'b', label: 'Stand', result, detail })
    expect(e('started')).toBeNull()
    expect(e('done')).toMatchObject({ kind: 'task_done', message: 'Stand', seq: 1 })
    expect(e('started')).toBeNull()
    expect(e('done')?.seq).toBe(2)
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
    rec.event({ at: NOW, blockId: 'b', label: 'Stand', result: 'done' })
    expect(rec.endedEvent(out, NOW + 5000)).toMatchObject({ kind: 'run_ended', message: 'stopped', seq: 2 })
    expect(startRunRecord(mission, robot, 'operator-dev', NOW).endedEvent({ result: 'completed', commandsSent: 1 }, NOW))
      .toMatchObject({ message: null, seq: 1 })
  })
})

describe('recordSink', () => {
  const entry = (label: string) => ({ at: NOW, blockId: 'b', label, result: 'done' as const })

  it('sends the run, then its events in order, and closes it', async () => {
    const calls: string[] = []
    const io = {
      putRun: async (r: { result: string }) => { calls.push(`put:${r.result}`) },
      postRunEvents: async (_id: string, evs: { seq: number; kind: string }[]) => { calls.push(...evs.map((e) => `${e.seq}:${e.kind}`)) },
    }
    const sink = recordSink(startRunRecord(mission, robot, 'operator-dev', NOW), io, () => { throw new Error('no') })
    sink.event({ ...entry('a'), result: 'started' })
    sink.event(entry('a'))
    sink.event(entry('b'))
    await sink.end({ result: 'completed', commandsSent: 2 }, NOW + 1)
    expect(calls).toEqual(['put:running', '0:run_started', '1:task_done', '2:task_done', 'put:completed', '3:run_ended'])
    expect(sink.failed()).toBe(false)
  })

  it('reports a failure once, never throws, and keeps sending', async () => {
    const errors: unknown[] = []
    let posts = 0
    const io = {
      putRun: async () => { throw new Error('offline') },
      postRunEvents: async () => { posts++; throw new Error('no run') },
    }
    const sink = recordSink(startRunRecord(mission, robot, 'operator-dev', NOW), io, (e) => errors.push(e))
    sink.event(entry('a'))
    await expect(sink.end({ result: 'completed', commandsSent: 1 }, NOW)).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(posts).toBe(3)
    expect(sink.failed()).toBe(true)
  })
})

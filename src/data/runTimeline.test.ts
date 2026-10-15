import { describe, expect, it } from 'vitest'
import type { MissionRun, RunEvent } from '@/types'
import { eventOffsetMs, eventsAtOrBefore, runDurationMs, timelineMarks } from './runTimeline'

const run = { started_at: '2026-10-16T06:00:00Z', ended_at: '2026-10-16T06:10:00Z' } as MissionRun
const ev = (seq: number, at: string, kind: RunEvent['kind'] = 'arrived') => ({ run_id: 'r', seq, at, kind } as RunEvent)

describe('run timeline', () => {
  it('measures duration and offsets', () => {
    expect(runDurationMs(run)).toBe(600_000)
    expect(eventOffsetMs(run, ev(0, '2026-10-16T06:05:00Z'))).toBe(300_000)
  })
  it('a running run measures to now', () => {
    const live = { ...run, ended_at: null } as MissionRun
    expect(runDurationMs(live, Date.parse('2026-10-16T06:02:00Z'))).toBe(120_000)
  })
  it('places marks as percentages, clamped', () => {
    const marks = timelineMarks(run, [ev(0, '2026-10-16T05:59:00Z'), ev(1, '2026-10-16T06:05:00Z', 'detection'), ev(2, '2026-10-16T06:20:00Z')])
    expect(marks.map((m) => m.pct)).toEqual([0, 50, 100])
    expect(marks[1].kind).toBe('detection')
  })
  it('finds the latest event at or before a video position', () => {
    const events = [ev(0, '2026-10-16T06:00:00Z'), ev(1, '2026-10-16T06:04:00Z'), ev(2, '2026-10-16T06:08:00Z')]
    expect(eventsAtOrBefore(events, 300_000, run)?.seq).toBe(1)
    expect(eventsAtOrBefore(events, -1, run)).toBeNull()
  })
})

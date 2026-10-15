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

describe('markColor', () => {
  it('colours by kind and falls back to t3', async () => {
    const { markColor } = await import('./runTimeline')
    const { color } = await import('@/design-system/tokens')
    expect(markColor('detection')).toBe(color.amber)
    expect(markColor('task_done')).toBe(color.accent)
    expect(markColor('announcement_played')).toBe(color.green)
    expect(markColor('alert')).toBe(color.red)
    expect(markColor('recording_gap')).toBe(color.red)
    expect(markColor('arrived')).toBe(color.t3)
  })
})

describe('followsPlayback', () => {
  it('is suppressed for 1 s after a click, then resumes', async () => {
    const { followsPlayback } = await import('./runTimeline')
    expect(followsPlayback(10_500, 10_000)).toBe(false)
    expect(followsPlayback(11_001, 10_000)).toBe(true)
  })
})

describe('formatClock', () => {
  it('is 24-hour HH:MM:SS for ko-KR and en-GB', async () => {
    const { formatClock } = await import('./runTimeline')
    const d = new Date(2026, 9, 16, 13, 49, 15).toISOString()
    for (const loc of ['ko-KR', 'en-GB', 'en-US']) expect(formatClock(d, loc)).toBe('13:49:15')
    expect(formatClock(new Date(2026, 9, 16, 0, 5, 9).toISOString(), 'en-US')).toBe('00:05:09')
  })
})

describe('otherRecordings', () => {
  it('lists every video but the one playing, then audio, and nothing else', async () => {
    const { otherRecordings } = await import('./runTimeline')
    const files = [
      { path: 'video/run_front.mp4', size_bytes: 1 }, { path: 'video/run_rear.mp4', size_bytes: 2 },
      { path: 'video/02_gate_front_060412.mp4', size_bytes: 3 }, { path: 'audio/000500_announcement.wav', size_bytes: 4 },
      { path: 'photos/a.jpg', size_bytes: 5 }, { path: 'detections/b.jpg', size_bytes: 6 },
    ]
    expect(otherRecordings(files, 'video/run_front.mp4').map((f) => f.path)).toEqual([
      'video/run_rear.mp4', 'video/02_gate_front_060412.mp4', 'audio/000500_announcement.wav'])
    expect(otherRecordings(files, null).map((f) => f.path)).toHaveLength(4)
  })
})

describe('formatSize', () => {
  it('uses B, KB, MB and GB', async () => {
    const { formatSize } = await import('./runTimeline')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(96_000)).toBe('94 KB')
    expect(formatSize(180_000_000)).toBe('172 MB')
    expect(formatSize(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})

import { describe, expect, it } from 'vitest'
import type { MissionRun, RunEvent } from '@/types'
import i18n from '@/i18n'
import { describeRunEvent, eventOffsetMs, eventsAtOrBefore, runDurationMs, runEndReason, timelineMarks } from './runTimeline'

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

describe('describeRunEvent', () => {
  const t = i18n.t.bind(i18n)
  const edge = (extra: Partial<RunEvent>) => ({ ...ev(1, '2026-10-16T06:01:00Z'), waypoint_id: null, message: null, reason: null, result: null, snapshot_id: null, media: null, ...extra } as RunEvent)
  const opts = { t, waypointLabel: () => undefined, snapshotUrl: (id: string) => `/snapshots/${id}` }

  it('test_step_events_render_with_labels_and_reasons', () => {
    const done = describeRunEvent(edge({ kind: 'step_done', message: 'Say hello' }), opts)
    expect(done.title).toBe('Step done')
    expect(done.detail).toBe('Say hello')
    const failed = describeRunEvent(edge({ kind: 'step_failed', message: 'Walk', reason: 'estop' }), opts)
    expect(failed.detail).toBe('Walk · E-Stop is engaged')
    const skipped = describeRunEvent(edge({ kind: 'step_skipped', message: 'Walk', reason: 'timeLimit' }), opts)
    expect(skipped.detail).toBe('Walk · the running-time limit was reached')
    expect(describeRunEvent(edge({ kind: 'paused', message: 'Walk' }), opts).title).toBe('Paused')
    expect(describeRunEvent(edge({ kind: 'resumed', message: 'Walk' }), opts).detail).toBe('Walk')
  })
  it('test_snapshot_step_links_media', () => {
    const d = describeRunEvent(edge({ kind: 'step_done', message: 'Photo', snapshot_id: 'snap-1' }), opts)
    expect(d.thumbUrl).toBe('/snapshots/snap-1')
    expect(describeRunEvent(edge({ kind: 'step_done', message: 'Walk' }), opts).thumbUrl).toBeNull()
  })
  it('test_run_ended_shows_result_and_reason', () => {
    const d = describeRunEvent(edge({ kind: 'run_ended', result: 'aborted', reason: 'bridgeRestarted' }), opts)
    expect(d.detail).toBe('Aborted · the robot’s edge device restarted during the run')
    expect(describeRunEvent(edge({ kind: 'run_ended', result: 'completed' }), opts).detail).toBe('Completed')
  })
  it('old browser-run records still describe as before', () => {
    const wp = { ...opts, waypointLabel: (id: string) => (id === 'w1' ? 'Gate' : undefined) }
    expect(describeRunEvent(edge({ kind: 'arrived', waypoint_id: 'w1' }), wp).detail).toBe('Gate')
    expect(describeRunEvent(edge({ kind: 'alert', message: 'Low battery' }), wp).detail).toBe('Low battery')
    expect(describeRunEvent(edge({ kind: 'run_ended' }), wp).detail).toBeNull()
  })
})

describe('runEndReason', () => {
  const t = i18n.getFixedT('en')
  it('shows why a run ended, for a run that failed to start and has no events', () => {
    expect(runEndReason({ end_reason: 'noAnswer' }, t)).toBe('no answer from the robot; it may still be moving')
    expect(runEndReason({ end_reason: 'REJECTED_INVALID_PROGRAM: bad steps' }, t)).toBe('bad steps')
    expect(runEndReason({ end_reason: null }, t)).toBeNull()
  })
})

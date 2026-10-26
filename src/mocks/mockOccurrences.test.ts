import { describe, expect, it } from 'vitest'
import { describeOccurrence } from '@/missions/calendarDays'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionSchedule, type MissionTask } from '@/types'
import { materialiseMockOccurrences } from './mockOccurrences'

const schedule = (over: Partial<MissionSchedule> = {}): MissionSchedule => ({
  schedule_id: 's', recurrence: 'weekly', start_at: '2026-10-05T06:00', timezone: 'Asia/Seoul',
  days_of_week: [0, 2], window_minutes: null, until: null, skip_dates: [], ...over,
})
const task = (over: Partial<MissionTask> = {}): MissionTask => ({
  task_id: 'tk', mission_id: 'm-route', site_id: 'site-a', name: null, robot_id: 'r1', schedule: schedule(),
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'x', created_at: '', updated_at: '', version: 1, ...over,
})
const missions = [
  { mission_id: 'm-route', kind: 'route' }, { mission_id: 'm-prog', kind: 'program' },
] as MissionLibraryEntry[]
// Monday 2026-10-26 00:00 Seoul .. Monday 2026-11-02 00:00 Seoul.
const FROM = '2026-10-25T15:00:00.000Z'
const TO = '2026-11-01T15:00:00.000Z'
const NOW = new Date('2026-10-26T00:00:00Z')
const ids = (o: { occurrence_id: string }[]) => o.map((x) => x.occurrence_id)

describe('materialiseMockOccurrences', () => {
  it('makes a weekly schedule\'s runs in the window, at the schedule\'s wall-clock time', () => {
    const out = materialiseMockOccurrences([task()], missions, FROM, TO, NOW)
    // Mon 26 and Wed 28 at 06:00 Seoul = 21:00Z the evening before.
    expect(out.map((o) => o.due_at)).toEqual(['2026-10-25T21:00:00Z', '2026-10-27T21:00:00Z'])
    expect(ids(out)).toEqual(['tk-20261025T210000Z', 'tk-20261027T210000Z'])
    expect(out[0]).toMatchObject({ task_id: 'tk', mission_id: 'm-route', site_id: 'site-a', robot_id: 'r1', run_id: null })
  })

  it('respects the half-open window at both edges', () => {
    const at = (iso: string) => task({ schedule: schedule({ recurrence: 'once', start_at: iso }) })
    // Exactly `from` is in; exactly `to` is out.
    expect(materialiseMockOccurrences([at('2026-10-26T00:00')], missions, FROM, TO, NOW)).toHaveLength(1)
    expect(materialiseMockOccurrences([at('2026-11-02T00:00')], missions, FROM, TO, NOW)).toHaveLength(0)
    expect(materialiseMockOccurrences([at('2026-10-25T23:59')], missions, FROM, TO, NOW)).toHaveLength(0)
    expect(materialiseMockOccurrences([at('2026-11-01T23:59')], missions, FROM, TO, NOW)).toHaveLength(1)
  })

  it('honours recurrence, start date, until and skip_dates', () => {
    const run = (s: Partial<MissionSchedule>) => materialiseMockOccurrences([task({ schedule: schedule(s) })], missions, FROM, TO, NOW).length
    expect(run({ recurrence: 'daily' })).toBe(7)
    expect(run({ recurrence: 'daily', start_at: '2026-10-29T06:00' })).toBe(4)
    expect(run({ recurrence: 'daily', until: '2026-10-28' })).toBe(3)
    expect(run({ recurrence: 'daily', skip_dates: ['2026-10-27'] })).toBe(6)
    expect(run({ recurrence: 'once', start_at: '2026-10-30T06:00' })).toBe(1)
  })

  it('leaves out tasks that are paused, unscheduled or on another site', () => {
    const tasks = [task({ status: 'paused' }), task({ task_id: 'b', schedule: null }), task({ task_id: 'c', site_id: 'site-b' })]
    expect(materialiseMockOccurrences(tasks, missions, FROM, TO, NOW, 'site-a')).toEqual([])
  })

  it('orders by due_at then occurrence_id', () => {
    const out = materialiseMockOccurrences([task({ task_id: 'z' }), task({ task_id: 'a' })], missions, FROM, TO, NOW)
    expect(ids(out)).toEqual([
      'a-20261025T210000Z', 'z-20261025T210000Z', 'a-20261027T210000Z', 'z-20261027T210000Z',
    ])
  })

  it('skips a past run no_executor with the server\'s wording, and renders it as waiting, not failed', () => {
    const [past] = materialiseMockOccurrences([task()], missions, FROM, TO, NOW)
    expect(past).toMatchObject({ status: 'skipped', skip_reason: 'no_executor', message: 'nothing on the edge can run a route mission yet' })
    const view = describeOccurrence(past)
    expect(view.tone).toBe('neutral')
    expect(view.statusKey).toBe('missions.calendar.waiting')
    expect(view.detail).toBe('nothing on the edge can run a route mission yet')
  })

  it('names the mission kind, so a program is not blamed on route hardware', () => {
    const [p] = materialiseMockOccurrences([task({ mission_id: 'm-prog' })], missions, FROM, TO, NOW)
    expect(p.message).toBe('nothing on the edge can run a program mission yet')
  })

  it('skips a run whose mission is gone as mission_missing, not no_executor', () => {
    const [m] = materialiseMockOccurrences([task({ mission_id: 'nope' })], missions, FROM, TO, NOW)
    expect(m).toMatchObject({ status: 'skipped', skip_reason: 'mission_missing' })
  })

  it('leaves a run that is not yet due as scheduled, as the server does', () => {
    const out = materialiseMockOccurrences([task()], missions, FROM, TO, NOW)
    expect(out.map((o) => o.status)).toEqual(['skipped', 'scheduled'])
    expect(out[1]).toMatchObject({ skip_reason: null, message: null })
  })
})

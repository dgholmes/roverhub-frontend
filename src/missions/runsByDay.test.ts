import { describe, expect, it } from 'vitest'
import type { TaskOccurrence } from '@/types'
import { findClashes, nextRunFor, runsWindow, splitRuns } from './runsByDay'

const TZ = 'Asia/Seoul'
let n = 0
const occ = (due_at: string, over: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
  occurrence_id: `o${++n}`, task_id: 't', mission_id: 'm', site_id: 's', robot_id: 'r1',
  due_at, status: 'scheduled', run_id: null, skip_reason: null, message: null, ...over,
})

describe('runsWindow', () => {
  it('spans a week back to the end of a week ahead, at site midnights', () => {
    expect(runsWindow('2026-11-06', TZ)).toEqual({
      from: '2026-10-29T15:00:00.000Z', // 30 Oct, 00:00 in Seoul
      to: '2026-11-13T15:00:00.000Z', // 14 Nov, 00:00 in Seoul
    })
  })
})

describe('splitRuns', () => {
  it('puts today and later under Upcoming, earlier days under History newest first', () => {
    const a = occ('2026-11-04T21:00:00Z') // 5 Nov 06:00 Seoul
    const b = occ('2026-11-05T21:00:00Z') // 6 Nov 06:00 Seoul, today
    const c = occ('2026-11-05T09:00:00Z') // 5 Nov 18:00 Seoul
    const d = occ('2026-11-06T09:00:00Z') // 6 Nov 18:00 Seoul
    const { upcoming, history } = splitRuns([d, a, b, c], '2026-11-06', TZ)
    expect(upcoming).toEqual([{ date: '2026-11-06', runs: [b, d] }])
    expect(history).toEqual([{ date: '2026-11-05', runs: [c, a] }])
  })

  it('leaves out a run whose time cannot be read', () => {
    expect(splitRuns([occ('nonsense')], '2026-11-06', TZ)).toEqual({ upcoming: [], history: [] })
  })
})

describe('findClashes', () => {
  const tenMin = () => 600

  it('pairs two pending runs that overlap on one robot', () => {
    const a = occ('2026-11-06T09:00:00Z')
    const b = occ('2026-11-06T09:05:00Z')
    const c = occ('2026-11-06T09:30:00Z')
    const clashes = findClashes([a, b, c], tenMin)
    expect(clashes.get(a.occurrence_id)).toBe(b)
    expect(clashes.get(b.occurrence_id)).toBe(a)
    expect(clashes.has(c.occurrence_id)).toBe(false)
  })

  it('ignores other robots, runs with no robot, and runs already over', () => {
    const a = occ('2026-11-06T09:00:00Z')
    expect(findClashes([a, occ('2026-11-06T09:00:00Z', { robot_id: 'r2' })], tenMin).size).toBe(0)
    expect(findClashes([a, occ('2026-11-06T09:00:00Z', { robot_id: null })], tenMin).size).toBe(0)
    expect(findClashes([a, occ('2026-11-06T09:00:00Z', { status: 'skipped' })], tenMin).size).toBe(0)
  })

  it('counts a run with no estimate as a minute long', () => {
    const a = occ('2026-11-06T09:00:00Z')
    expect(findClashes([a, occ('2026-11-06T09:00:30Z')], () => null).size).toBe(2)
    expect(findClashes([a, occ('2026-11-06T09:01:00Z')], () => null).size).toBe(0)
  })
})

describe('nextRunFor', () => {
  it('is the earliest pending run from now on for that robot', () => {
    const now = Date.parse('2026-11-06T03:00:00Z')
    const past = occ('2026-11-06T02:00:00Z')
    const later = occ('2026-11-07T09:00:00Z')
    const soon = occ('2026-11-06T09:00:00Z')
    const done = occ('2026-11-06T04:00:00Z', { status: 'succeeded' })
    const other = occ('2026-11-06T05:00:00Z', { robot_id: 'r2' })
    expect(nextRunFor('r1', [past, later, soon, done, other], now)).toBe(soon)
    expect(nextRunFor('r3', [past], now)).toBeNull()
  })
})

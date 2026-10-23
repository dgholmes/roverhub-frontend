import { describe, expect, it } from 'vitest'
import { RESOURCES } from '@/i18n'
import { OCCURRENCE_STATUSES, SKIP_REASONS, type OccurrenceStatus, type SkipReason, type TaskOccurrence } from '@/types'
import { bucketByDay, describeOccurrence, siteDate, siteMinutes, SKIP_REASON_COPY, STATUS_COPY, weekWindow } from './calendarDays'

const occ = (id: string, due_at: string, over: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
  occurrence_id: id, task_id: 't1', mission_id: 'm1', site_id: 's1', robot_id: 'r1',
  due_at, status: 'scheduled', run_id: null, skip_reason: null, message: null, ...over,
})

/** Resolve a dotted key against a locale's strings, the way i18next would. */
function lookup(tree: object, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
}
const LOCALES = { en: RESOURCES.en.translation, ko: RESOURCES.ko.translation }

describe('siteDate / siteMinutes', () => {
  it('reads an instant on the site\'s wall clock, not UTC\'s', () => {
    // 15:30Z is 00:30 the next morning in Seoul (+09:00).
    expect(siteDate('2026-10-26T15:30:00Z', 'Asia/Seoul')).toBe('2026-10-27')
    expect(siteMinutes('2026-10-26T15:30:00Z', 'Asia/Seoul')).toBe(30)
    // ...and 11:30 the same day in New York (EDT, -04:00).
    expect(siteDate('2026-10-26T15:30:00Z', 'America/New_York')).toBe('2026-10-26')
    expect(siteMinutes('2026-10-26T15:30:00Z', 'America/New_York')).toBe(11 * 60 + 30)
  })

  it('reads midnight as 00:00, never 24:00', () => {
    expect(siteMinutes('2026-10-26T15:00:00Z', 'Asia/Seoul')).toBe(0)
    expect(siteDate('2026-10-26T15:00:00Z', 'Asia/Seoul')).toBe('2026-10-27')
  })

  it('returns null for an instant that is not one, rather than a made-up day', () => {
    expect(siteDate('not a date', 'Asia/Seoul')).toBeNull()
    expect(siteMinutes('', 'Asia/Seoul')).toBeNull()
  })
})

describe('weekWindow', () => {
  it('spans the week\'s first midnight to the next week\'s, on the site\'s clock', () => {
    // Seoul midnight is 15:00Z the evening before.
    expect(weekWindow('2026-10-26', 'Asia/Seoul')).toEqual({ from: '2026-10-25T15:00:00.000Z', to: '2026-11-01T15:00:00.000Z' })
  })

  it('is 7 calendar days, not 168 hours, across a DST change', () => {
    // US clocks go back on 2026-11-01: that week is 169 hours long.
    const w = weekWindow('2026-10-26', 'America/New_York')
    expect(w).toEqual({ from: '2026-10-26T04:00:00.000Z', to: '2026-11-02T05:00:00.000Z' })
    expect(siteDate(w.from, 'America/New_York')).toBe('2026-10-26')
    expect(siteMinutes(w.from, 'America/New_York')).toBe(0)
    expect(siteMinutes(w.to, 'America/New_York')).toBe(0)
  })
})

describe('bucketByDay', () => {
  const week = ['2026-10-26', '2026-10-27', '2026-10-28']

  it('buckets occurrences into the site timezone\'s days, not UTC days', () => {
    const late = occ('late', '2026-10-26T15:30:00Z')   // 00:30 on the 27th in Seoul
    const early = occ('early', '2026-10-26T14:59:00Z') // 23:59 on the 26th in Seoul
    const byDay = bucketByDay([early, late], week, 'Asia/Seoul')
    expect(byDay['2026-10-26'].map((o) => o.occurrence_id)).toEqual(['early'])
    expect(byDay['2026-10-27'].map((o) => o.occurrence_id)).toEqual(['late'])
  })

  it('keeps the server\'s order within a day', () => {
    // Deliberately not sorted by time or id: the server's order is the contract.
    const a = occ('b', '2026-10-27T01:00:00Z')
    const b = occ('a', '2026-10-27T00:00:00Z')
    const c = occ('c', '2026-10-27T02:00:00Z')
    expect(bucketByDay([a, b, c], week, 'Asia/Seoul')['2026-10-27'].map((o) => o.occurrence_id)).toEqual(['b', 'a', 'c'])
  })

  it('gives every requested day a bucket, empty when nothing is due', () => {
    expect(bucketByDay([], week, 'Asia/Seoul')).toEqual({ '2026-10-26': [], '2026-10-27': [], '2026-10-28': [] })
  })

  it('drops an occurrence outside the requested days, and one with an unreadable time', () => {
    const out = occ('out', '2026-12-01T00:00:00Z')
    const bad = occ('bad', 'garbage')
    const byDay = bucketByDay([out, bad], week, 'Asia/Seoul')
    expect(Object.values(byDay).flat()).toEqual([])
  })
})

describe('describeOccurrence', () => {
  it('maps every SkipReason to its own copy key', () => {
    // Exhaustive over the union: a member added to SKIP_REASONS without copy
    // fails here, instead of rendering a raw enum value at an operator.
    const keys = SKIP_REASONS.map((r) => SKIP_REASON_COPY[r])
    expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true)
    expect(new Set(keys).size).toBe(SKIP_REASONS.length)
    expect(Object.keys(SKIP_REASON_COPY).sort()).toEqual([...SKIP_REASONS].sort())
  })

  it('has copy in both locales for every SkipReason, translated rather than copied', () => {
    for (const reason of SKIP_REASONS as readonly SkipReason[]) {
      const key = SKIP_REASON_COPY[reason]
      const en = lookup(LOCALES.en, key)
      const ko = lookup(LOCALES.ko, key)
      expect(typeof en, `en ${key}`).toBe('string')
      expect(typeof ko, `ko ${key}`).toBe('string')
      expect((en as string).length).toBeGreaterThan(0)
      expect(ko).not.toBe(en)
      expect(ko as string).toMatch(/[가-힣]/)
    }
  })

  it('has copy in both locales for every OccurrenceStatus', () => {
    for (const status of OCCURRENCE_STATUSES as readonly OccurrenceStatus[]) {
      const key = STATUS_COPY[status]
      for (const [code, tree] of Object.entries(LOCALES)) {
        expect(typeof lookup(tree, key), `${code} ${key}`).toBe('string')
      }
    }
  })

  it('shows an occurrence\'s reason only when it was skipped', () => {
    const skipped = describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status: 'skipped', skip_reason: 'robot_busy' }))
    expect(skipped.reasonKey).toBe(SKIP_REASON_COPY.robot_busy)
    // A stale reason on a run that went ahead must not be shown as if it were why.
    expect(describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status: 'running', skip_reason: 'robot_busy' })).reasonKey).toBeNull()
    // Skipped with no reason: say nothing rather than invent one.
    expect(describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status: 'skipped', skip_reason: null })).reasonKey).toBeNull()
  })

  it('calls no_executor waiting on the backpack, never failed', () => {
    // spec §9: with no executors configured this is every occurrence, for months.
    const d = describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status: 'skipped', skip_reason: 'no_executor' }))
    expect(d.tone).toBe('neutral')
    expect(d.tone).not.toBe('red')
    for (const [code, tree] of Object.entries(LOCALES)) {
      const copy = [lookup(tree, d.statusKey), lookup(tree, d.reasonKey!)].join(' | ')
      expect(copy, code).not.toMatch(/fail|error|broken|실패|오류|고장/i)
    }
    expect(lookup(LOCALES.en, SKIP_REASON_COPY.no_executor)).toMatch(/backpack/i)
    expect(lookup(LOCALES.ko, SKIP_REASON_COPY.no_executor)).toMatch(/백팩/)
    // Not even the headline says "skipped": nothing was passed over, it has no executor yet.
    expect(lookup(LOCALES.en, d.statusKey)).not.toMatch(/skip/i)
  })

  it('keeps red for a run that started and failed', () => {
    expect(describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status: 'failed' })).tone).toBe('red')
    for (const reason of SKIP_REASONS) {
      expect(describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status: 'skipped', skip_reason: reason })).tone, reason).not.toBe('red')
    }
  })

  it('tones the other states', () => {
    const tone = (status: OccurrenceStatus) => describeOccurrence(occ('x', '2026-10-27T00:00:00Z', { status })).tone
    expect(tone('succeeded')).toBe('green')
    expect(tone('running')).toBe('blue')
    expect(tone('scheduled')).toBe('neutral')
    expect(tone('cancelled')).toBe('neutral')
  })
})

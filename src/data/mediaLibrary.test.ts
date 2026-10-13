import { describe, expect, it } from 'vitest'
import type { SnapshotRecord } from '@/types'
import { groupByDay, sinceFor } from './mediaLibrary'

const now = new Date(2026, 9, 13, 15, 0, 0)
const snap = (id: string, at: Date, captured = true): SnapshotRecord => ({
  snapshot_id: id, robot_id: 'r', site_id: 's', camera: null,
  captured_at: captured ? at.toISOString() : null, received_at: at.toISOString(),
  size_bytes: 1, position: null, image_url: '',
})

describe('sinceFor', () => {
  it('starts today at local midnight', () => {
    expect(new Date(sinceFor('today', now)!).getHours()).toBe(0)
  })
  it('goes back seven days', () => {
    expect(new Date(sinceFor('7d', now)!).getDate()).toBe(6)
  })
  it('is open-ended for all', () => expect(sinceFor('all', now)).toBeUndefined())
})

describe('groupByDay', () => {
  it('labels today and yesterday and keeps newest day first', () => {
    const groups = groupByDay([
      snap('a', new Date(2026, 9, 13, 14)),
      snap('b', new Date(2026, 9, 12, 9)),
      snap('c', new Date(2026, 9, 13, 8)),
      snap('d', new Date(2026, 9, 10, 9)),
    ], now)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Saturday 10 October'])
    expect(groups[0].items.map((s) => s.snapshot_id)).toEqual(['a', 'c'])
  })
  it('falls back to the received time when capture time is unknown', () => {
    expect(groupByDay([snap('x', new Date(2026, 9, 12, 9), false)], now)[0].label).toBe('Yesterday')
  })
})

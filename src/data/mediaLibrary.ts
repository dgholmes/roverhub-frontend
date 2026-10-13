import type { SnapshotRecord } from '@/types'

export type MediaRange = 'today' | '7d' | '30d' | 'all'

/** Start of the range as an ISO time, or undefined for "all". "Today" starts
 * at local midnight, not 24 hours ago. */
export function sinceFor(range: MediaRange, now = new Date()): string | undefined {
  if (range === 'all') return undefined
  const d = new Date(now)
  if (range === 'today') {
    d.setHours(0, 0, 0, 0)
  } else {
    d.setDate(d.getDate() - (range === '7d' ? 7 : 30))
  }
  return d.toISOString()
}

export interface DayGroup { key: string; label: string; items: SnapshotRecord[] }

/** Groups snapshots by local day, newest day first, keeping the input order
 * within a day. Uses the capture time when known, else when it was received. */
export function groupByDay(items: SnapshotRecord[], now = new Date()): DayGroup[] {
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = dayKey(now)
  const y = new Date(now); y.setDate(y.getDate() - 1)
  const yesterday = dayKey(y)
  const groups = new Map<string, DayGroup>()
  for (const s of items) {
    const d = new Date(s.captured_at ?? s.received_at)
    const key = dayKey(d)
    if (!groups.has(key)) {
      const label = key === today ? 'Today' : key === yesterday ? 'Yesterday'
        : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      groups.set(key, { key, label, items: [] })
    }
    groups.get(key)!.items.push(s)
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
}

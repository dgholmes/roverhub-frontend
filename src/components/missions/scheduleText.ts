import i18n from '@/i18n'
import { formatLocale } from '@/i18n'
import { parseStart } from '@/missions/schedule'
import type { MissionSchedule } from '@/types'

/** Weekday names, Monday first, in the current language. */
export function weekdayNames(style: 'short' | 'long' = 'short'): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(formatLocale(), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))))
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** "Weekdays 06:00", "Daily 22:00", "Once, 2026-10-20 10:00". */
export function scheduleSummary(s: MissionSchedule): string {
  const start = parseStart(s.start_at)
  if (!start) return '—'
  const time = hhmm(start.minutes)
  if (s.recurrence === 'once') return i18n.t('missions.schedule.summaryOnce', { date: start.date, time })
  if (s.recurrence === 'daily') return i18n.t('missions.schedule.summaryDaily', { time })
  const days = [...s.days_of_week].sort()
  if (days.join() === '0,1,2,3,4') return i18n.t('missions.schedule.summaryWeekdays', { time })
  const names = weekdayNames()
  return i18n.t('missions.schedule.summaryWeekly', { days: days.map((d) => names[d]).join(', '), time })
}

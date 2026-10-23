import type { MissionSchedule } from '@/types'
import type { SchedulableMission } from './transitionalScheduling'

/**
 * Schedules are wall-clock times in the schedule's own timezone:
 * `start_at` is "YYYY-MM-DDTHH:mm" with no offset, read in `timezone`. A
 * 06:00 patrol stays at 06:00 across a DST change, which an offset can't say.
 * The calendar shows the site's own days, so all the arithmetic here is on
 * date strings and minutes of the day; no Date is ever converted between
 * zones.
 */

export interface Occurrence {
  mission: SchedulableMission
  robot_id: string | null
  /** "YYYY-MM-DD" in the schedule's timezone. */
  date: string
  startMin: number
  durationMin: number
  /** Another run of the same robot overlaps this one. */
  clash: boolean
}

export function parseStart(start_at: string): { date: string; minutes: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(start_at)
  if (!m) return null
  return { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) }
}

export function formatStart(date: string, minutes: number): string {
  return `${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** "YYYY-MM-DD" plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Monday = 0 … Sunday = 6, as in the schema. */
export function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** The Monday on or before `date`. */
export function weekStart(date: string): string {
  return addDays(date, -weekday(date))
}

/** Today's date in a timezone, as "YYYY-MM-DD". */
export function todayIn(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function runsOn(s: MissionSchedule, date: string): boolean {
  const start = parseStart(s.start_at)
  if (!start || date < start.date) return false
  switch (s.recurrence) {
    case 'once': return date === start.date
    case 'daily': return true
    case 'weekly': return s.days_of_week.includes(weekday(date))
  }
}

/** Every run in the 7 days from `monday`, with clashes marked. A run's
 * length is the mission's time estimate, at least 15 minutes so it stays
 * visible and conservative. */
export function occurrencesInWeek(missions: SchedulableMission[], monday: string): Occurrence[] {
  const out: Occurrence[] = []
  for (let d = 0; d < 7; d++) {
    const date = addDays(monday, d)
    for (const m of missions) {
      if (!m.schedule || !runsOn(m.schedule, date)) continue
      const start = parseStart(m.schedule.start_at)!
      const durationMin = Math.max(15, Math.ceil((m.estimates?.duration_s ?? 0) / 60))
      out.push({ mission: m, robot_id: m.robot_id ?? null, date, startMin: start.minutes, durationMin, clash: false })
    }
  }
  for (const a of out) {
    a.clash = out.some((b) => b !== a && a.robot_id !== null && b.robot_id === a.robot_id && b.date === a.date
      && a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
}

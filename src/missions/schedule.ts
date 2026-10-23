/**
 * Schedules are wall-clock times in the schedule's own timezone:
 * `start_at` is "YYYY-MM-DDTHH:mm" with no offset, read in `timezone`. A
 * 06:00 patrol stays at 06:00 across a DST change, which an offset can't say.
 * The arithmetic here is on date strings and minutes of the day; no Date is
 * ever converted between zones. Working out *when* a schedule falls due is the
 * backend's job (tasks/scheduler.py); the calendar reads the result.
 */

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

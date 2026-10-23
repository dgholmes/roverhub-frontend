import { wallClockToInstant } from '@/missions/calendarDays'
import { addDays, parseStart, weekday } from '@/missions/schedule'
import type { MissionLibraryEntry, MissionSchedule, MissionTask, TaskOccurrence } from '@/types'

/**
 * MOCK ONLY. The fake backend's stand-in for `tasks/scheduler.py`: it works
 * out which occurrences a schedule produces in a window, so mock mode has a
 * calendar to look at. The real console never computes occurrences -- the
 * server does -- so this must not be imported outside `src/mocks/`. (It
 * deliberately puts back, in a fake, the kind of computation the calendar
 * itself had deleted.)
 *
 * What it simplifies against the server:
 * - DST: a wall-clock time is turned into an instant with one correction pass
 *   (calendarDays.wallClockToInstant), not the server's zoneinfo handling.
 * - Only `recurrence`, `start_at`, `until` and `skip_dates` are read. No
 *   dispatch gates: robot availability, busy, dispatch rules and
 *   `window_minutes` are never consulted, so `window_missed`,
 *   `robot_unavailable`, `robot_busy` and `dispatch_rule` never appear.
 * - No horizon: it answers any window it is asked for, past or future,
 *   where the server only materialises 14 days ahead.
 * - Nothing is stored. Each call recomputes, so a past run's outcome is
 *   re-derived rather than remembered.
 *
 * What it keeps: mock mode has no executor either, so a run whose time has
 * passed is `skipped / no_executor` with the server's wording, and one not
 * yet due is `scheduled`.
 */

/** Never walk more than this many days for one task, however wide the window. */
const MAX_DAYS = 400

function runsOn(s: MissionSchedule, date: string, startDate: string): boolean {
  if (date < startDate) return false
  if (s.until && date > s.until) return false
  if (s.skip_dates.includes(date)) return false
  switch (s.recurrence) {
    case 'once': return date === startDate
    case 'daily': return true
    case 'weekly': return s.days_of_week.includes(weekday(date))
  }
}

function iso(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`
}

/** Occurrences with from <= due_at < to, in the server's order (due_at, then id). */
export function materialiseMockOccurrences(
  tasks: readonly MissionTask[], missions: readonly MissionLibraryEntry[],
  from: string, to: string, now: Date, siteId?: string,
): TaskOccurrence[] {
  const lo = Date.parse(from)
  const hi = Date.parse(to)
  if (Number.isNaN(lo) || Number.isNaN(hi)) return []
  const out: TaskOccurrence[] = []
  for (const task of tasks) {
    if (task.status !== 'enabled' || !task.schedule) continue
    if (siteId !== undefined && task.site_id !== siteId) continue
    const start = parseStart(task.schedule.start_at)
    if (!start) continue
    // A day either side of the window, because the schedule's wall-clock day
    // and the window's UTC bounds can disagree about which day an instant is on.
    const first = new Date(lo).toISOString().slice(0, 10)
    const last = new Date(hi).toISOString().slice(0, 10)
    for (let date = addDays(first, -1), n = 0; date <= addDays(last, 1) && n < MAX_DAYS; date = addDays(date, 1), n++) {
      if (!runsOn(task.schedule, date, start.date)) continue
      let due: number
      try { due = wallClockToInstant(date, start.minutes, task.schedule.timezone) } catch { continue }
      if (due < lo || due >= hi) continue
      const mission = missions.find((m) => m.mission_id === task.mission_id)
      const base = {
        occurrence_id: `${task.task_id}-${iso(due).replace(/[-:]/g, '')}`,
        task_id: task.task_id, mission_id: task.mission_id, site_id: task.site_id, robot_id: task.robot_id,
        due_at: iso(due), run_id: null,
      }
      if (due > now.getTime()) {
        out.push({ ...base, status: 'scheduled', skip_reason: null, message: null })
      } else if (!mission) {
        out.push({
          ...base, status: 'skipped', skip_reason: 'mission_missing',
          message: `mission '${task.mission_id}' is missing or unreadable in the mission library, so there is nothing to run`,
        })
      } else {
        out.push({
          ...base, status: 'skipped', skip_reason: 'no_executor',
          message: `nothing on the edge can run a ${mission.kind} mission yet`,
        })
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.occurrence_id.localeCompare(b.occurrence_id))
}

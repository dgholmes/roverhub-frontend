import type { OccurrenceStatus, TaskOccurrence } from '@/types'
import { siteDate, wallClockToInstant } from './calendarDays'
import { addDays } from './schedule'

/**
 * What Schedule › Runs decides, kept out of the JSX so it can be tested. Like
 * the calendar it only reads the server's queue: grouping by the site's days,
 * splitting what is still to come from what is over, and spotting two runs
 * planned on one robot at once.
 */

/** How far each way the Runs view looks. */
export const RUNS_DAYS_AHEAD = 7
export const RUNS_DAYS_BACK = 7

/** The window asked for: the site's midnight `RUNS_DAYS_BACK` days ago to its
 * midnight `RUNS_DAYS_AHEAD` days after today, half-open. */
export function runsWindow(today: string, timezone: string): { from: string; to: string } {
  return {
    from: new Date(wallClockToInstant(addDays(today, -RUNS_DAYS_BACK), 0, timezone)).toISOString(),
    to: new Date(wallClockToInstant(addDays(today, RUNS_DAYS_AHEAD + 1), 0, timezone)).toISOString(),
  }
}

/** Statuses for a run that has not started yet, and may still clash. */
const PENDING: ReadonlySet<OccurrenceStatus> = new Set(['scheduled', 'due'])

export function isPending(o: TaskOccurrence): boolean {
  return PENDING.has(o.status)
}

export interface DayGroup { date: string; runs: TaskOccurrence[] }

/**
 * Upcoming: every run on today or later, today's finished ones included, so
 * "what happened this morning" sits above "what is next". History: the days
 * before today, newest first. Runs whose time cannot be read are left out.
 */
export function splitRuns(
  occurrences: readonly TaskOccurrence[], today: string, timezone: string,
): { upcoming: DayGroup[]; history: DayGroup[] } {
  const byDate = new Map<string, TaskOccurrence[]>()
  for (const o of occurrences) {
    const d = siteDate(o.due_at, timezone)
    if (d === null) continue
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(o)
  }
  const groups = [...byDate.entries()]
    .map(([date, runs]) => ({ date, runs: [...runs].sort((a, b) => a.due_at.localeCompare(b.due_at)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return {
    upcoming: groups.filter((g) => g.date >= today),
    history: groups.filter((g) => g.date < today).reverse()
      .map((g) => ({ ...g, runs: [...g.runs].reverse() })),
  }
}

/**
 * Pending runs that overlap another pending run on the same robot, each mapped
 * to the run it overlaps. A run occupies `[due, due + its mission's estimated
 * duration)`, at least a minute; a run with no robot clashes with nothing.
 * The server decides what actually happens (it skips the later one as
 * `robot_busy`); this is the warning before it comes due.
 */
export function findClashes(
  occurrences: readonly TaskOccurrence[], durationS: (missionId: string) => number | null | undefined,
): Map<string, TaskOccurrence> {
  const out = new Map<string, TaskOccurrence>()
  const byRobot = new Map<string, TaskOccurrence[]>()
  for (const o of occurrences) {
    if (!o.robot_id || !isPending(o) || Number.isNaN(Date.parse(o.due_at))) continue
    if (!byRobot.has(o.robot_id)) byRobot.set(o.robot_id, [])
    byRobot.get(o.robot_id)!.push(o)
  }
  for (const runs of byRobot.values()) {
    runs.sort((a, b) => a.due_at.localeCompare(b.due_at))
    for (let i = 0; i < runs.length; i++) {
      const a = runs[i]
      const aEnd = Date.parse(a.due_at) + Math.max(60, durationS(a.mission_id) ?? 60) * 1000
      for (let j = i + 1; j < runs.length && Date.parse(runs[j].due_at) < aEnd; j++) {
        const b = runs[j]
        if (!out.has(a.occurrence_id)) out.set(a.occurrence_id, b)
        if (!out.has(b.occurrence_id)) out.set(b.occurrence_id, a)
      }
    }
  }
  return out
}

/** A robot's next pending run at or after `nowMs`, if any. */
export function nextRunFor(
  robotId: string, occurrences: readonly TaskOccurrence[], nowMs: number,
): TaskOccurrence | null {
  let best: TaskOccurrence | null = null
  for (const o of occurrences) {
    if (o.robot_id !== robotId || !isPending(o)) continue
    const at = Date.parse(o.due_at)
    if (Number.isNaN(at) || at < nowMs) continue
    if (!best || o.due_at < best.due_at) best = o
  }
  return best
}

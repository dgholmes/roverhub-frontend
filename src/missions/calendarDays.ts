import type { OccurrenceStatus, SkipReason, TaskOccurrence } from '@/types'
import { addDays } from './schedule'

/**
 * What the schedule calendar decides, kept out of the JSX so it can be tested
 * (this repo has no DOM test environment).
 *
 * The calendar *reads* the server's task queue. The backend works each
 * occurrence's `due_at` out in UTC from the schedule's own timezone, so all the
 * browser does is place that instant on the site's calendar days, and choose
 * the words for what became of it.
 */

// --- Days -------------------------------------------------------------------

const PARTS = new Map<string, Intl.DateTimeFormat>()

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = PARTS.get(timezone)
  if (!f) {
    // hourCycle h23 so midnight is 00, not 24.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    PARTS.set(timezone, f)
  }
  return f
}

/** The wall clock in `timezone` at `ms`, as the UTC milliseconds that read the same. */
function wallClockMs(ms: number, timezone: string): number {
  let f: Intl.DateTimeFormat
  try { f = formatter(timezone) } catch { f = formatter('UTC') }
  const p: Record<string, number> = {}
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/** "YYYY-MM-DD" in the site's timezone, or null if `iso` is not an instant. */
export function siteDate(iso: string, timezone: string): string | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return new Date(wallClockMs(ms, timezone)).toISOString().slice(0, 10)
}

/** Minutes after midnight in the site's timezone, or null if `iso` is not an instant. */
export function siteMinutes(iso: string, timezone: string): number | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const wall = new Date(wallClockMs(ms, timezone))
  return wall.getUTCHours() * 60 + wall.getUTCMinutes()
}

/** The UTC instant at which `date` ("YYYY-MM-DD") begins in `timezone`. */
function startOfDay(date: string, timezone: string): number {
  const wall = Date.parse(`${date}T00:00:00Z`)
  // The offset depends on the instant, which is what we are solving for, so
  // refine once: the second pass lands on the right side of a DST change.
  const first = wall - (wallClockMs(wall, timezone) - wall)
  return wall - (wallClockMs(first, timezone) - first)
}

/**
 * The half-open window `[from, to)` the queue is asked for: the site's own
 * midnight on `monday` to its midnight seven days on. Calendar days, not 168
 * hours, so a week with a DST change still ends at midnight.
 */
export function weekWindow(monday: string, timezone: string): { from: string; to: string } {
  return {
    from: new Date(startOfDay(monday, timezone)).toISOString(),
    to: new Date(startOfDay(addDays(monday, 7), timezone)).toISOString(),
  }
}

/**
 * Occurrences grouped under the given days, read in the site's timezone. Each
 * day lists its occurrences in the order given: the server orders by `due_at`
 * and the calendar does not second-guess it. An occurrence that falls on none
 * of the days, or whose time cannot be read, is left out rather than guessed at.
 */
export function bucketByDay(
  occurrences: readonly TaskOccurrence[], dates: readonly string[], timezone: string,
): Record<string, TaskOccurrence[]> {
  const out: Record<string, TaskOccurrence[]> = Object.fromEntries(dates.map((d) => [d, []]))
  for (const o of occurrences) {
    const date = siteDate(o.due_at, timezone)
    if (date !== null && date in out) out[date].push(o)
  }
  return out
}

// --- Words ------------------------------------------------------------------

/**
 * Copy key per SkipReason. `satisfies Record<SkipReason, …>` makes a new member
 * a compile error here, and calendarDays.test.ts checks each key resolves in
 * every locale: no enum value ever reaches an operator as raw text.
 */
export const SKIP_REASON_COPY = {
  no_executor: 'missions.calendar.skip.no_executor',
  mission_missing: 'missions.calendar.skip.mission_missing',
  robot_unavailable: 'missions.calendar.skip.robot_unavailable',
  robot_busy: 'missions.calendar.skip.robot_busy',
  dispatch_rule: 'missions.calendar.skip.dispatch_rule',
  window_missed: 'missions.calendar.skip.window_missed',
} as const satisfies Record<SkipReason, string>

export const STATUS_COPY = {
  scheduled: 'missions.calendar.status.scheduled',
  due: 'missions.calendar.status.due',
  dispatched: 'missions.calendar.status.dispatched',
  running: 'missions.calendar.status.running',
  succeeded: 'missions.calendar.status.succeeded',
  failed: 'missions.calendar.status.failed',
  skipped: 'missions.calendar.status.skipped',
  cancelled: 'missions.calendar.status.cancelled',
} as const satisfies Record<OccurrenceStatus, string>

/** The same tones the kit's Badge takes. */
export type OccurrenceTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red'

const TONE: Record<OccurrenceStatus, OccurrenceTone> = {
  scheduled: 'neutral', due: 'blue', dispatched: 'blue', running: 'blue',
  succeeded: 'green', failed: 'red', skipped: 'amber', cancelled: 'neutral',
}

export interface OccurrenceView {
  statusKey: typeof STATUS_COPY[OccurrenceStatus] | 'missions.calendar.waiting'
  tone: OccurrenceTone
  /** Why it was skipped; null unless it was, and null if the server gave none. */
  reasonKey: typeof SKIP_REASON_COPY[SkipReason] | null
}

/**
 * How an occurrence reads. `no_executor` is special: until the navigation
 * backpack exists it is the fate of every occurrence (spec §9), so it is shown
 * as an honest state, "waiting", neutral, and never in the red a failure gets.
 */
export function describeOccurrence(o: TaskOccurrence): OccurrenceView {
  if (o.status !== 'skipped') return { statusKey: STATUS_COPY[o.status], tone: TONE[o.status], reasonKey: null }
  const reasonKey = o.skip_reason ? SKIP_REASON_COPY[o.skip_reason] ?? null : null
  if (o.skip_reason === 'no_executor') return { statusKey: 'missions.calendar.waiting', tone: 'neutral', reasonKey }
  return { statusKey: STATUS_COPY.skipped, tone: TONE.skipped, reasonKey }
}

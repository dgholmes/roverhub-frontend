import i18n from '@/i18n'
import { conflictOf, type Conflict } from '@/lib/realtime/apiError'
import {
  DEFAULT_DISPATCH_RULE,
  type DispatchRule, type MissionLibraryEntry, type MissionSchedule, type MissionTask, type RobotState, type RobotType,
  type TaskOccurrence, type ValidationIssue, type ValidationSeverity,
} from '@/types'
import { describeOccurrence, siteDate, siteMinutes, type OccurrenceView } from './calendarDays'
import type { AvailabilityStatus } from './robotAvailability'
import { formatStart, parseStart, todayIn } from './schedule'
import { scheduleSummary } from './scheduleText'

/**
 * The decisions behind the Tasks panel and the library's task columns.
 *
 * This repo has no DOM test environment, so anything that decides what a user
 * sees lives here, where it can be tested, and the components only draw it.
 * Logic left in JSX on this branch has twice shipped inverted.
 */

type Translate = (key: string, options?: Record<string, unknown>) => string
const tr = (key: string, options?: Record<string, unknown>) => (i18n.t as unknown as Translate)(key, options)

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

// --- The tasks of a mission -------------------------------------------------

/** A mission's live tasks: its own, and not the archived ones. */
export function tasksOf(tasks: readonly MissionTask[], missionId: string): MissionTask[] {
  return tasks.filter((t) => t.mission_id === missionId && t.status !== 'archived')
}

/**
 * The type of robot the mission is for, when its tasks agree on one. A mission
 * has no robot of its own any more -- its tasks do -- so the gait and block
 * checks that want a robot type read it from them. Two types, no named robot,
 * or a robot nobody has heard of: null, which those checks read as "unknown".
 */
export function missionRobotType(tasks: readonly MissionTask[], robots: readonly RobotState[]): RobotType | null {
  const types = new Set<RobotType | null>()
  for (const t of tasks) {
    if (t.robot_id === null) continue
    types.add(robots.find((r) => r.robot_id === t.robot_id)?.robot_type ?? null)
  }
  if (types.size !== 1) return null
  return [...types][0]
}

/** The robot a program run should default to: the one every named task shares. */
export function defaultRunRobot(tasks: readonly MissionTask[]): string | undefined {
  const named = new Set(tasks.map((t) => t.robot_id).filter((id): id is string => id !== null))
  return named.size === 1 ? [...named][0] : undefined
}

// --- A new task, and how a schedule reads -----------------------------------

/** Weekdays at 06:00 from today in the site's own calendar, as the toggle always defaulted. */
export function defaultSchedule(taskId: string, timezone: string, now: Date): MissionSchedule {
  return {
    schedule_id: `sch-${taskId}`, recurrence: 'weekly', start_at: formatStart(todayIn(timezone, now), 6 * 60), timezone,
    days_of_week: [0, 1, 2, 3, 4], window_minutes: null, until: null, skip_dates: [],
  }
}

/** A new task, for `mission` if one is picked already; a task with no mission cannot be saved. */
export function newTask({ mission, siteId, timezone, creator, now }: {
  mission: MissionLibraryEntry | null
  siteId: string
  timezone: string
  creator: string
  now: Date
}): MissionTask {
  const task_id = `task-${now.getTime().toString(36)}`
  const stamp = now.toISOString()
  return {
    task_id, mission_id: mission?.mission_id ?? '', site_id: mission?.site_id ?? siteId, name: null,
    // Nothing is chosen for the operator: an unset robot is a visible warning, not a guess.
    robot_id: null,
    schedule: defaultSchedule(task_id, timezone, now),
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE },
    status: 'enabled', max_duration_min: null, created_by: creator, created_at: stamp, updated_at: stamp, version: 1,
  }
}

/** "Weekdays 06:00", "Daily 22:00 · until 2026-12-31", or "Manual only". */
export function taskScheduleLine(task: MissionTask): string {
  const s = task.schedule
  if (!s) return tr('missions.tasks.manual')
  const line = scheduleSummary(s)
  return s.until ? `${line} · ${tr('missions.tasks.until', { date: s.until })}` : line
}

// --- Dispatch rules ---------------------------------------------------------

/**
 * Rules the backend reads and ignores, each for a reason of its own. Five of
 * the six (spec §6.3, as corrected 2026-10-23). `min_battery_pct` is not here:
 * it is enforceable in principle, it just has no data behind it
 * (`no_reading`), which is a different thing to tell an operator.
 */
export const UNENFORCED_RULES = [
  'require_network', 'require_approval', 'block_if_maintenance_flagged', 'max_wind_kph', 'require_safety_checklist',
] as const satisfies readonly (keyof DispatchRule)[]

export type RuleStatus = 'not_enforced' | 'no_reading'

export interface RuleView {
  key: keyof DispatchRule
  /**
   * `not_enforced`: nothing reads this value, so the control is shown disabled
   * with its reason. `no_reading`: the scheduler does read it, but there is no
   * battery reading to compare it with.
   */
  status: RuleStatus
  /** Whether the operator can change it. A disabled control still shows what is stored. */
  editable: boolean
  reasonKey: string
  /** Set only when the stored value will make the task skip every time. */
  warningKey: string | null
}

const RULE_ORDER: readonly (keyof DispatchRule)[] = [
  'min_battery_pct', 'require_network', 'require_approval', 'block_if_maintenance_flagged', 'max_wind_kph', 'require_safety_checklist',
]

export function dispatchRuleViews(rule: DispatchRule): RuleView[] {
  return RULE_ORDER.map((key): RuleView => {
    const reasonKey = `missions.tasks.rule.reason.${key}`
    if (key === 'min_battery_pct') {
      // `> 0`, as the scheduler reads it: 0 is the explicit "no minimum", and
      // anything above it with no reading is a skip.
      const skips = rule.min_battery_pct !== null && rule.min_battery_pct > 0
      return { key, status: 'no_reading', editable: true, reasonKey, warningKey: skips ? 'missions.tasks.rule.batterySkips' : null }
    }
    return { key, status: 'not_enforced', editable: false, reasonKey, warningKey: null }
  })
}

/**
 * The badge beside a rule. `require_network` is not "not enforced": it is
 * enforced unconditionally by the scheduler's reachability check, and merely
 * no longer a setting, so a badge saying otherwise would contradict the
 * sentence next to it.
 */
export function ruleBadgeKey(view: RuleView): string {
  if (view.key === 'require_network') return 'missions.tasks.rule.notASetting'
  return view.status === 'no_reading' ? 'missions.tasks.rule.noReading' : 'missions.tasks.rule.notEnforced'
}

// --- Checks on one task -----------------------------------------------------

declare const savedBrand: unique symbol
/**
 * A mission as the server holds it. Branded so that a draft cannot stand in
 * for one: the duration cap is decided against what the scheduler will read,
 * and `taskIssues(task, { mission, stored })` used to type-check with the two
 * transposed, which is the very mistake it exists to prevent.
 */
export type SavedMission = MissionLibraryEntry & { readonly [savedBrand]: true }

/** Mark a mission read from the store (never a draft) as the saved one. */
export function savedMission(m: MissionLibraryEntry): SavedMission {
  return m as SavedMission
}

/** Shortest window assumed for timed announcements when the schedule sets none. */
export const MIN_ESTIMATED_WINDOW_MIN = 15

export function canSaveTask(issues: readonly ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error')
}

function issue(severity: ValidationSeverity, code: string, params: Record<string, unknown> = {}): ValidationIssue {
  return { severity, code, message: tr(`missions.tasks.issue.${code}`, params), waypoint_id: null }
}

/**
 * What is wrong with a task as written. Errors stop it being saved; warnings
 * are worth a look. These used to be checks on the mission, back when the
 * mission carried the robot and schedule.
 */
export function taskIssues(task: MissionTask, ctx: {
  /** The mission as being edited: what the announcement-window check reads. */
  draft: MissionLibraryEntry
  /**
   * The mission as saved, or null if it is not known. The duration cap is read
   * from this, never from the draft: the scheduler reads the stored mission's
   * estimate, so a draft's would demand a cap the server does not need, or
   * leave one off that the server then skips the task over.
   */
  saved: SavedMission | null
  robotStatus?: AvailabilityStatus | null
}): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const mission = ctx.draft

  // The scheduler skips an occurrence whose robot is unset (branch 3), so this
  // is never "any robot will do".
  if (task.robot_id === null) out.push(issue('warning', 'noRobot'))
  else if (ctx.robotStatus && ctx.robotStatus !== 'available') {
    // Not available right now is only a warning: the task may run later.
    out.push(issue('warning', 'robotNotAvailable', { status: tr(`missions.robot.${ctx.robotStatus}`).toLowerCase() }))
  }

  const s = task.schedule
  if (s?.recurrence === 'weekly' && s.days_of_week.length === 0) out.push(issue('error', 'weeklyNoDays'))

  // A mission with no computable duration (an unresolved wait or loop) would
  // hold the robot for as long as it ran; the scheduler refuses to queue it
  // without a cap. A program whose estimate is not known is treated the same:
  // guessing "bounded" is the fabrication this check exists to stop.
  const cap = task.max_duration_min
  const estimate = ctx.saved?.estimates
  const unbounded = estimate ? !estimate.duration_bounded : mission.kind === 'program'
  if (cap !== null && !(Number.isInteger(cap) && cap > 0)) out.push(issue('error', 'badDurationCap'))
  else if (unbounded && cap === null) out.push(issue('error', 'needsDurationCap'))

  const start = s ? parseStart(s.start_at) : null
  if (s && start && (mission.announcements ?? []).length > 0) {
    // No window set: the mission's estimated duration stands in for it.
    const estimated = mission.estimates?.duration_s ?? 0
    const window = s.window_minutes ?? Math.max(MIN_ESTIMATED_WINDOW_MIN, Math.ceil(estimated / 60))
    for (const a of mission.announcements ?? []) {
      const [h, m] = a.at.split(':').map(Number)
      // Minutes after the start, wrapped so a window can cross midnight.
      const offset = (((h * 60 + m - start.minutes) % 1440) + 1440) % 1440
      if (offset > window) out.push(issue('warning', 'timedOutsideWindow', { at: a.at }))
    }
  }
  return out
}

// --- A stale save -----------------------------------------------------------

export type TaskConflict =
  | { kind: 'stale'; stored: MissionTask }
  | { kind: 'refused'; detail: string | null }

const isTask = (x: unknown): x is MissionTask =>
  typeof x === 'object' && x !== null && typeof (x as MissionTask).task_id === 'string' && typeof (x as MissionTask).version === 'number'

/** What a failed save or run-now means for a task, or null when it is not a conflict. */
export function taskConflict(e: unknown): TaskConflict | null {
  const c: Conflict | null = conflictOf(e)
  if (!c) return null
  if (c.kind === 'stale') return isTask(c.stored) ? { kind: 'stale', stored: c.stored } : { kind: 'refused', detail: null }
  return c
}

/**
 * The two ways out of a stale save. Either take what the server holds, or keep
 * my edits and adopt the server's version so the next save is not stale again:
 * a deliberate overwrite, chosen after seeing what changed.
 */
export function resolveConflict(mine: MissionTask, stored: MissionTask, choice: 'theirs' | 'mine'): MissionTask {
  return choice === 'theirs' ? stored : { ...mine, version: stored.version }
}

export interface SaveState {
  disabled: boolean
  /** Which of `missions.tasks.{saving,save,saved}` to show. */
  label: 'saving' | 'save' | 'saved'
}

/**
 * The save button. Disabled for nothing to save, a request in flight, a stale
 * write not yet resolved, or a failing check -- so an unbounded task with no
 * cap cannot be saved. This lives here, and not in the markup, so that
 * dropping one of those terms fails a test instead of shipping.
 */
export function saveState({ dirty, saving, issues, stale }: {
  dirty: boolean
  saving: boolean
  issues: readonly ValidationIssue[]
  stale: boolean
}): SaveState {
  return {
    disabled: !dirty || saving || !canSaveTask(issues) || stale,
    label: saving ? 'saving' : dirty ? 'save' : 'saved',
  }
}

/** A saved task is confirmed before removal; one never saved is just dropped. */
export function removeAction(baseline: MissionTask | null): 'confirm' | 'discard' {
  return baseline ? 'confirm' : 'discard'
}

/** Whether the draft differs from what the server holds. `updated_at` is the server's stamp, not an edit. */
export function taskIsDirty(draft: MissionTask, saved: MissionTask | null): boolean {
  if (saved === null) return true
  const { updated_at: _a, ...mine } = draft
  const { updated_at: _b, ...theirs } = saved
  return JSON.stringify(mine) !== JSON.stringify(theirs)
}

// --- The library's derived columns -----------------------------------------

export type RobotCell =
  | { kind: 'none' } | { kind: 'unset' } | { kind: 'one'; robotId: string } | { kind: 'varies'; unset: number }
export type ScheduleCell =
  | { kind: 'none' } | { kind: 'manual' } | { kind: 'one'; line: string } | { kind: 'many'; count: number }
export interface RunCell {
  occurrenceId: string
  /** Site-local, `YYYY-MM-DD` and `HH:mm`. */
  date: string
  time: string
  view: OccurrenceView
}
export interface LibraryRow {
  robot: RobotCell
  schedule: ScheduleCell
  /** The soonest run still ahead, as the server materialised it. */
  nextRun: Pick<RunCell, 'occurrenceId' | 'date' | 'time'> | null
  /** The most recent occurrence that has come due, and how it came out. */
  lastResult: RunCell | null
}

/**
 * What the library shows for a mission now that it has no robot, schedule or
 * status of its own. All of it is read off tasks and the server's occurrences;
 * nothing is worked out in the browser. `library_status` is gone and nothing
 * stands in for it: "Next run" and "Last result" are the facts it was a poor
 * proxy for.
 */
export function libraryRow(
  missionId: string, tasks: readonly MissionTask[], occurrences: readonly TaskOccurrence[], nowMs: number, timezone: string,
): LibraryRow {
  const own = tasksOf(tasks, missionId)
  const named = new Set(own.map((t) => t.robot_id))

  const robot: RobotCell = own.length === 0 ? { kind: 'none' }
    // `unset` is counted apart so a mix that includes a task with no robot is not
    // read as a mix of robots: that task is skipped every time it comes due.
    : named.size > 1 ? { kind: 'varies', unset: own.filter((t) => t.robot_id === null).length }
    : own[0].robot_id === null ? { kind: 'unset' }
    : { kind: 'one', robotId: own[0].robot_id }

  const schedule: ScheduleCell = own.length === 0 ? { kind: 'none' }
    : own.length > 1 ? { kind: 'many', count: own.length }
    : own[0].schedule ? { kind: 'one', line: taskScheduleLine(own[0]) }
    : { kind: 'manual' }

  // Only an enabled task has a next run; a paused one has none to promise.
  const enabled = new Set(own.filter((t) => t.status === 'enabled').map((t) => t.task_id))
  const live = new Set(own.map((t) => t.task_id))
  const mine = (o: TaskOccurrence) => o.mission_id === missionId
  return {
    robot, schedule,
    nextRun: soonestAhead(occurrences.filter((o) => mine(o) && enabled.has(o.task_id)), nowMs, timezone),
    lastResult: latestDone(occurrences.filter((o) => mine(o) && live.has(o.task_id)), nowMs, timezone),
  }
}

const when = (o: TaskOccurrence) => Date.parse(o.due_at)
function siteWhen(o: TaskOccurrence, timezone: string): { date: string; time: string } | null {
  const date = siteDate(o.due_at, timezone)
  const minutes = siteMinutes(o.due_at, timezone)
  return date === null || minutes === null ? null : { date, time: hhmm(minutes) }
}

/** The soonest of these occurrences still to come, in site time. */
export function soonestAhead(occurrences: readonly TaskOccurrence[], nowMs: number, timezone: string): Pick<RunCell, 'occurrenceId' | 'date' | 'time'> | null {
  const ahead = occurrences
    .filter((o) => o.status === 'scheduled' && when(o) >= nowMs)
    .sort((a, b) => when(a) - when(b) || a.occurrence_id.localeCompare(b.occurrence_id))
  for (const o of ahead) {
    const t = siteWhen(o, timezone)
    if (t) return { occurrenceId: o.occurrence_id, ...t }
  }
  return null
}

/** The most recent of these occurrences that has come due, and how it came out. */
export function latestDone(occurrences: readonly TaskOccurrence[], nowMs: number, timezone: string): RunCell | null {
  const done = occurrences
    .filter((o) => o.status !== 'scheduled' && o.status !== 'cancelled' && when(o) <= nowMs)
    .sort((a, b) => when(b) - when(a) || b.occurrence_id.localeCompare(a.occurrence_id))
  for (const o of done) {
    const t = siteWhen(o, timezone)
    if (t) return { occurrenceId: o.occurrence_id, ...t, view: describeOccurrence(o) }
  }
  return null
}

export function scheduleCellText(c: ScheduleCell): string {
  switch (c.kind) {
    case 'none': return tr('missions.library.noTasks')
    case 'manual': return tr('missions.tasks.manual')
    case 'one': return c.line
    case 'many': return tr('missions.library.taskCount', { count: c.count })
  }
}

/** `describe` names a robot the way the caller wants it shown. */
export function robotCellText(c: RobotCell, describe: (robotId: string) => string): string {
  switch (c.kind) {
    case 'none': return '—'
    // Not "any robot": the scheduler skips a task whose robot is unset.
    case 'unset': return tr('missions.tasks.noRobot')
    case 'one': return describe(c.robotId)
    case 'varies': return c.unset > 0 ? tr('missions.library.variesUnset', { n: c.unset }) : tr('missions.library.varies')
  }
}

/** The window the library asks the server for: the scheduler's two-week horizon ahead, and as far back. */
export function libraryWindow(nowMs: number): { from: string; to: string } {
  const hour = 3_600_000
  const day = 24 * hour
  // To the hour, so the view can ask for a fresh window as time passes without
  // asking on every clock tick.
  const base = Math.floor(nowMs / hour) * hour
  return { from: new Date(base - 14 * day).toISOString(), to: new Date(base + 14 * day).toISOString() }
}

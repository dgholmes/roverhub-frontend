/**
 * Mirrors shared/schemas/tasks.py. Hand-maintained — change both together.
 * `src/missions/missionTasks.test.ts` reads that file and fails on drift.
 *
 * A `MissionTask` is the *assignment* of a mission to a robot on a schedule;
 * a `TaskOccurrence` is one due instance of it, materialised by the backend
 * scheduler. Not to be confused with a `WaypointAction` — what happens at a
 * stop — which the UI used to call a "task" (see missions/waypointActions.ts).
 *
 * The dependency runs one way, as in Python: this file imports nothing from
 * missions.ts, and `mission_id` here is a plain string.
 */

// Each union is derived from a const array, so the runtime list the drift test
// compares against the Python can never differ from the type the compiler checks.
export const SCHEDULE_RECURRENCES = ['once', 'daily', 'weekly'] as const
export type ScheduleRecurrence = typeof SCHEDULE_RECURRENCES[number]

export const TASK_STATUSES = ['enabled', 'paused', 'archived'] as const
export type TaskStatus = typeof TASK_STATUSES[number]

export const OCCURRENCE_STATUSES = [
  'scheduled', 'due', 'dispatched', 'running', 'succeeded', 'failed', 'skipped', 'cancelled',
] as const
export type OccurrenceStatus = typeof OCCURRENCE_STATUSES[number]

/** Why an occurrence was skipped rather than run. `failed` is a different
 * status, for a run that started. `mission_missing` is distinct from
 * `no_executor` on purpose: a deleted mission must not read as "waiting on
 * hardware". */
export const SKIP_REASONS = [
  'no_executor', 'mission_missing', 'robot_unavailable', 'robot_busy', 'dispatch_rule', 'window_missed', 'unattended_disabled',
] as const
export type SkipReason = typeof SKIP_REASONS[number]

/** PRD MIS-011. `start_at` is a wall-clock datetime with no offset; `timezone`
 * an IANA name, so a 09:00 patrol stays at 09:00 across DST. days_of_week:
 * Mon=0..Sun=6. */
export interface MissionSchedule {
  schedule_id: string
  recurrence: ScheduleRecurrence
  start_at: string
  timezone: string
  days_of_week: number[]
  /** An occurrence not dispatched within this many minutes of `due_at` is
   * skipped as `window_missed`. null means no limit. */
  window_minutes: number | null
  /** Last date (YYYY-MM-DD, read in `timezone`) the schedule runs; null runs forever. */
  until: string | null
  /** Dates (YYYY-MM-DD, read in `timezone`) on which an occurrence is not made. */
  skip_dates: string[]
}

/** PRD MIS-013 prerequisites. Defaults refuse rather than permit. */
export interface DispatchRule {
  min_battery_pct: number | null
  require_network: boolean
  require_approval: boolean
  block_if_maintenance_flagged: boolean
  max_wind_kph: number | null
  require_safety_checklist: boolean
}

export const DEFAULT_DISPATCH_RULE: DispatchRule = {
  min_battery_pct: null, require_network: true, require_approval: false,
  block_if_maintenance_flagged: true, max_wind_kph: null, require_safety_checklist: false,
}

export interface MissionTask {
  task_id: string
  mission_id: string
  site_id: string
  /** What the operator calls the task; null shows the mission's name. One
   * mission can have many tasks, and its name alone cannot tell them apart. */
  name: string | null
  /**
   * null means no robot is set, NOT "any robot": the scheduler skips every
   * occurrence of such a task (`robot_unavailable`) and the task panel warns
   * about it (`noRobot`). Never read null as "whichever is free".
   */
  robot_id: string | null
  /** null means the task is only ever run by hand. */
  schedule: MissionSchedule | null
  dispatch_rule: DispatchRule
  status: TaskStatus
  /** A cap on the run, required for a mission whose duration is unbounded. */
  max_duration_min: number | null
  created_by: string
  created_at: string
  updated_at: string
  /** Optimistic concurrency: the backend rejects a write whose version is not
   * the stored one (409). Send back what was read; never compute it. */
  version: number
}

export interface TaskOccurrence {
  occurrence_id: string
  task_id: string
  mission_id: string
  site_id: string
  robot_id: string | null
  /** UTC instant this occurrence is due. */
  due_at: string
  status: OccurrenceStatus
  run_id: string | null
  skip_reason: SkipReason | null
  message: string | null
}

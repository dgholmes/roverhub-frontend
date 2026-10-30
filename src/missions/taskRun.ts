import type { MissionLibraryEntry, MissionTask, RobotState, TaskOccurrence, ValidationIssue } from '@/types'
import { defaultSchedule, latestDone, soonestAhead, taskScheduleLine, type RunCell } from './taskPanel'

/**
 * The decisions behind the Schedule page's Tasks view, the task form and Run
 * now. As with taskPanel.ts, anything that decides what the operator sees or
 * what the robot is sent lives here, where it is tested; the components only
 * draw it.
 */

// --- Run now ----------------------------------------------------------------

/**
 * Why Run now is off for a task, or null when it can run. Only a program can
 * run today, from this browser: nothing on the robot side can run a route. The
 * UI translates these (`missions.tasks.runNowOff.*`) and shows the reason next
 * to the disabled button.
 */
export type RunNowBlock = 'missionMissing' | 'route' | 'paused' | 'noRobot' | 'noProgram'

export function runNowBlock(task: MissionTask, mission: MissionLibraryEntry | undefined): RunNowBlock | null {
  if (!mission) return 'missionMissing'
  if (mission.kind !== 'program') return 'route'
  if (task.status !== 'enabled') return 'paused'
  if (task.robot_id === null) return 'noRobot'
  if (!mission.program_state) return 'noProgram'
  return null
}

// --- When a task runs -------------------------------------------------------

/** The form's timing choice. "now" is a task with no schedule: started by hand. */
export type Timing = 'now' | 'once' | 'daily' | 'weekly'

export const TIMINGS: readonly Timing[] = ['now', 'once', 'daily', 'weekly']

export function timingOf(task: MissionTask): Timing {
  return task.schedule ? task.schedule.recurrence : 'now'
}

/** The task with its timing changed. The time and days already set are kept. */
export function withTiming(task: MissionTask, timing: Timing, timezone: string, now: Date): MissionTask {
  if (timing === 'now') return { ...task, schedule: null }
  const base = task.schedule ?? defaultSchedule(task.task_id, timezone, now)
  return { ...task, schedule: { ...base, recurrence: timing } }
}

// --- The task form ----------------------------------------------------------

/** The task's own checks, plus the one the form adds: a task needs a mission. */
export function withMissionIssue(issues: readonly ValidationIssue[], mission: MissionLibraryEntry | undefined, message: string): ValidationIssue[] {
  if (mission) return [...issues]
  return [{ severity: 'error', code: 'noMission', message, waypoint_id: null }, ...issues]
}

/** Which save buttons the form shows. "Save and run now" only where Run now could run it. */
export function formActions(task: MissionTask, mission: MissionLibraryEntry | undefined): { saveAndRun: boolean } {
  return { saveAndRun: runNowBlock(task, mission) === null }
}

// --- The Tasks view ---------------------------------------------------------

export interface TaskRow {
  task: MissionTask
  /** The task's own name, else its mission's. Null when both are missing. */
  title: string | null
  mission: MissionLibraryEntry | undefined
  robot: RobotState | undefined
  schedule: string
  nextRun: Pick<RunCell, 'occurrenceId' | 'date' | 'time'> | null
  lastResult: RunCell | null
  runNow: RunNowBlock | null
}

/**
 * The site's live tasks as the Tasks view lists them: enabled before paused,
 * then the soonest next run first, then by name. Next run and last result are
 * the server's occurrences, as in the mission library.
 */
export function taskRows(
  tasks: readonly MissionTask[], missions: readonly MissionLibraryEntry[], robots: readonly RobotState[],
  occurrences: readonly TaskOccurrence[], nowMs: number, timezone: string,
): TaskRow[] {
  const rows = tasks.filter((t) => t.status !== 'archived').map((task): TaskRow => {
    const mission = missions.find((m) => m.mission_id === task.mission_id)
    const own = occurrences.filter((o) => o.task_id === task.task_id)
    return {
      task,
      title: task.name?.trim() || mission?.name || null,
      mission,
      robot: task.robot_id === null ? undefined : robots.find((r) => r.robot_id === task.robot_id),
      schedule: taskScheduleLine(task),
      nextRun: task.status === 'enabled' ? soonestAhead(own, nowMs, timezone) : null,
      lastResult: latestDone(own, nowMs, timezone),
      runNow: runNowBlock(task, mission),
    }
  })
  const rank = (r: TaskRow) => (r.task.status === 'enabled' ? 0 : 1)
  const key = (r: TaskRow) => (r.nextRun ? `${r.nextRun.date} ${r.nextRun.time}` : '~')
  return rows.sort((a, b) =>
    rank(a) - rank(b) || key(a).localeCompare(key(b)) || (a.title ?? '').localeCompare(b.title ?? '') || a.task.task_id.localeCompare(b.task.task_id))
}

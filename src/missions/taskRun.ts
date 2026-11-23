import type { MissionLibraryEntry, MissionTask, RobotState, RobotType, SiteMap, TaskOccurrence, ValidationIssue } from '@/types'
import { defaultSchedule, latestDone, soonestAhead, taskScheduleLine, type RunCell } from './taskPanel'

/**
 * The decisions behind the Schedule page's Tasks view, the task form and Run
 * now. As with taskPanel.ts, anything that decides what the operator sees or
 * what the robot is sent lives here, where it is tested; the components only
 * draw it.
 */

// --- Run now ----------------------------------------------------------------

/**
 * Why Run now is off for a task, or null when it can run. The UI translates
 * these (`missions.tasks.runNowOff.*`) and shows the reason next to the
 * disabled button.
 *
 * A program runs its compiled blocks. A route (schema 0.0.16) is compiled by
 * the backend into walk-to-point legs on the bridge's nav path, so it can run
 * only where the backend would let it (runs/dispatch.py): on ITS OWN map, which
 * must exist and be active (a draft can still change under the robot), on a
 * robot not set up for another map, with no check errors (they mirror what the
 * backend's compiler refuses), and on a quad. Which map Missions happens to
 * show does not matter. The backend checks all of this again and its sentence
 * is what the operator reads if it refuses.
 */
export type RunNowBlock =
  | 'missionMissing' | 'paused' | 'noRobot' | 'noProgram'
  | 'mapNotActive' | 'robotOnOtherMap' | 'routeNotRunnable' | 'wheelRobot'

/** What a route's Run now needs to know beyond the task and its mission. */
export interface RunNowContext {
  /** The site's maps (useSiteMapStore.maps). Null or undefined: not known,
   * so a route is not offered. */
  maps?: readonly Pick<SiteMap, 'map_id' | 'status'>[] | null
  /** The task's robot's type, when it is loaded. */
  robotType?: RobotType | null
  /** The map the task's robot's bridge reports (`bridge.nav_map_id`). Null or
   * undefined is not known, and does not block: the cloud and the robot check
   * again. */
  robotNavMapId?: string | null
}

export function runNowBlock(task: MissionTask, mission: MissionLibraryEntry | undefined, ctx: RunNowContext = {}): RunNowBlock | null {
  if (!mission) return 'missionMissing'
  if (task.status !== 'enabled') return 'paused'
  if (task.robot_id === null) return 'noRobot'
  if (mission.kind === 'program') return mission.program_state ? null : 'noProgram'
  // A route, judged by its own map, as the backend does: missing, draft and
  // archived are refused, and so is a robot set up for another map.
  const map = ctx.maps?.find((m) => m.map_id === mission.map_id)
  if (!map || map.status !== 'active') return 'mapNotActive'
  if (ctx.robotNavMapId && ctx.robotNavMapId !== mission.map_id) return 'robotOnOtherMap'
  if (mission.waypoints.length === 0 || mission.validation?.status === 'invalid') return 'routeNotRunnable'
  if (ctx.robotType === 'wheel') return 'wheelRobot'
  return null
}

/** The route-only reasons, which the task form shows beside the mission. */
export const ROUTE_RUN_BLOCKS: readonly RunNowBlock[] = ['mapNotActive', 'robotOnOtherMap', 'routeNotRunnable', 'wheelRobot']

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
export function formActions(task: MissionTask, mission: MissionLibraryEntry | undefined, ctx: RunNowContext = {}): { saveAndRun: boolean } {
  return { saveAndRun: runNowBlock(task, mission, ctx) === null }
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
  /** The site's maps, for a route's Run now (see RunNowContext). */
  maps?: RunNowContext['maps'],
): TaskRow[] {
  const rows = tasks.filter((t) => t.status !== 'archived').map((task): TaskRow => {
    const mission = missions.find((m) => m.mission_id === task.mission_id)
    const own = occurrences.filter((o) => o.task_id === task.task_id)
    const robot = task.robot_id === null ? undefined : robots.find((r) => r.robot_id === task.robot_id)
    return {
      task,
      title: task.name?.trim() || mission?.name || null,
      mission,
      robot,
      schedule: taskScheduleLine(task),
      nextRun: task.status === 'enabled' ? soonestAhead(own, nowMs, timezone) : null,
      lastResult: latestDone(own, nowMs, timezone),
      runNow: runNowBlock(task, mission, { maps, robotType: robot?.robot_type ?? null, robotNavMapId: robot?.bridge?.nav_map_id ?? null }),
    }
  })
  const rank = (r: TaskRow) => (r.task.status === 'enabled' ? 0 : 1)
  const key = (r: TaskRow) => (r.nextRun ? `${r.nextRun.date} ${r.nextRun.time}` : '~')
  return rows.sort((a, b) =>
    rank(a) - rank(b) || key(a).localeCompare(key(b)) || (a.title ?? '').localeCompare(b.title ?? '') || a.task.task_id.localeCompare(b.task.task_id))
}

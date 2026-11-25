import { hashForSiteWorkspace } from '@/app/routes'
import { belowNewWorkLine } from '@/lib/batteryRules'
import { reachabilityOf } from '@/lib/connectivityHealth'
import type { StartRunRequest } from '@/lib/realtime/runStart'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { MissionLibraryEntry, MissionRun, MissionTask, RobotState, RobotType } from '@/types'
import type { MakeClip } from './program/prepareRun'
import type { RobotAvailability } from './robotAvailability'
import { startRunOnRobot, type StartTaskRunResult } from './startTaskRun'
import { tasksOf } from './taskPanel'

export interface StartMissionRunDeps {
  startRun: (robotId: string, req: StartRunRequest) => Promise<{ run: MissionRun }>
  makeClip: MakeClip
  robotType: (robotId: string) => RobotType | null
  /** The robot's battery: null is unknown, undefined is a robot not loaded. */
  batteryPct: (robotId: string) => number | null | undefined
}

export type StartMissionRunResult = StartTaskRunResult

/**
 * Starts a mission on a robot with no task: the library's Run. The same checks,
 * compile and speech clips as a task's Run now (startRunOnRobot), and the same
 * sentences when they refuse, but posted as a task-less run (POST
 * /robots/{id}/runs, source `run_now`). A route posts no steps: the backend
 * compiles it, and refuses it with a sentence if it cannot.
 */
export async function startMissionRun(deps: StartMissionRunDeps, mission: MissionLibraryEntry, robotId: string): Promise<StartMissionRunResult> {
  return startRunOnRobot({
    post: (steps) => deps.startRun(robotId, { mission, steps, source: 'run_now' }),
    makeClip: deps.makeClip,
    robotType: deps.robotType,
    batteryPct: deps.batteryPct,
  }, robotId, mission)
}

/**
 * Run from the mission library: start the mission on the robot, and on success
 * open LiveOps with that robot selected. A refusal comes back to the caller to
 * keep in view; nothing navigates.
 */
export async function runMissionNowAndOpen(siteId: string, mission: MissionLibraryEntry, robotId: string): Promise<StartMissionRunResult> {
  const result = await startMissionRun({
    // Through the store, so START_MISSION is tracked: an edge refusal after the
    // 201 reaches LiveOps' toasts and Logs, and the bar says Starting meanwhile.
    startRun: (id, req) => useLiveOpsStore.getState().startRun(id, req),
    makeClip: (id, text) => useLiveOpsStore.getState().createSpokenClip(id, text),
    robotType: (id) => useLiveOpsStore.getState().robots.find((r) => r.robot_id === id)?.robot_type ?? null,
    batteryPct: (id) => useLiveOpsStore.getState().robots.find((r) => r.robot_id === id)?.battery.percent,
  }, mission, robotId)
  if (result.ok) {
    useSessionStore.getState().setSelectedRobot(result.robotId)
    window.location.hash = hashForSiteWorkspace(siteId, 'LiveOps')
  }
  return result
}

/**
 * The robot Run offers first. A mission has no robot of its own, so: the one
 * robot its tasks use, when they agree on one at this site; else the robot the
 * session has selected, if it is at this site; else the first one online; else
 * none. `robots` are the site's robots.
 */
export function defaultRunRobot(
  mission: Pick<MissionLibraryEntry, 'mission_id'>,
  tasks: readonly MissionTask[],
  robots: readonly RobotState[],
  selectedRobotId: string | null,
): string | null {
  const onSite = (id: string | null) => id !== null && robots.some((r) => r.robot_id === id)
  const used = new Set(tasksOf(tasks, mission.mission_id).map((t) => t.robot_id).filter((id): id is string => id !== null))
  if (used.size === 1) {
    const [only] = used
    if (onSite(only)) return only
  }
  if (onSite(selectedRobotId)) return selectedRobotId
  return robots.find((r) => reachabilityOf(r) === 'online')?.robot_id ?? null
}

/** Why a robot cannot be picked to run this mission now, or null when it can.
 * Offline, busy and attention are what the robot's availability badge already
 * says; wheelRobot and batteryLow have their own words
 * (`missions.library.run.off.*`). */
export type RunRobotBlock = 'offline' | 'busy' | 'attention' | 'wheelRobot' | 'batteryLow'

/**
 * Whether Run's chooser lets this robot be picked. Unlike the task picker,
 * where a robot may be busy now and free when the task runs, this run starts
 * now: an offline, busy (on a mission, or someone has control) or critically
 * unwell robot would only be refused. A route needs a four-legged robot, and
 * a known reading under 15% is refused before anything is posted.
 * A warning (a hot motor, say) does not stop it.
 */
export function runRobotBlock(
  robot: Pick<RobotState, 'robot_type' | 'battery'>,
  availability: RobotAvailability,
  mission: Pick<MissionLibraryEntry, 'kind'>,
): RunRobotBlock | null {
  if (availability.status === 'offline') return 'offline'
  if (availability.status === 'onMission' || availability.status === 'inUse') return 'busy'
  if (availability.status === 'attention' && availability.attention?.severity === 'critical') return 'attention'
  if (mission.kind === 'route' && robot.robot_type === 'wheel') return 'wheelRobot'
  if (belowNewWorkLine(robot.battery.percent)) return 'batteryLow'
  return null
}

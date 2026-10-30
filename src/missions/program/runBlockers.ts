import { belowNewWorkLine } from '@/lib/batteryRules'
import type { RobotAvailability } from '@/missions/robotAvailability'
import type { MissionValidation, ValidationIssue } from '@/types'

/** Why Run is disabled. The UI translates these (`missions.program.run.blocker.*`). */
export type RunBlocker = 'noRobot' | 'releaseControl' | 'robotUnavailable' | 'programErrors' | 'missionErrors' | 'running' | 'batteryLow'

/** Mission checks about the drawn route, which a program run does not use: a
 * program mission runs its program, not its waypoints. */
const NOT_FOR_PROGRAM_RUN = new Set(['noWaypoints'])

/** The mission's errors that stop its program running now. */
export function programRunMissionErrors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error' && !i.waypoint_id && !NOT_FOR_PROGRAM_RUN.has(i.code))
}

/** The checks that decide whether the program can run: its own, plus the
 * mission's errors that apply to a program run. The Program tab's header
 * badge shows these instead of the route's checks. */
export function programRunValidation(programIssues: ValidationIssue[], missionErrors: ValidationIssue[]): MissionValidation {
  const issues = [...programIssues, ...missionErrors]
  const status = issues.some((i) => i.severity === 'error') ? 'invalid' : issues.some((i) => i.severity === 'warning') ? 'warnings' : 'valid'
  return { status, issues }
}

/** Whether the robot is free to start a run. The backend refuses a run while
 * anyone -- this operator included -- holds control, so "in use" is decided on
 * `controlOwner`: a robot that reads MANUAL with nobody in control (a wheel
 * robot standing upright) is free. A low battery or a warm motor is a warning,
 * not a reason to refuse; anything else that needs attention is. */
export function robotFreeForRun(a: RobotAvailability | undefined, controlOwner: string | null): boolean {
  if (!a) return false
  if (a.status === 'available') return true
  if (a.status === 'inUse') return controlOwner === null
  if (a.status === 'attention') return a.attention?.severity === 'warning' && (a.attention.kind === 'batteryLow' || a.attention.kind === 'motorHot')
  return false
}

/** Every reason Run is disabled, in the order the run bar reports them. */
export function runBlockers(x: {
  robotId: string | undefined
  availability: RobotAvailability | undefined
  controlOwner: string | null
  /** This operator holds control: they must release it (in LiveOps) first. */
  youHoldControl: boolean
  programErrors: number
  missionErrors: number
  running: boolean
  /** The chosen robot's battery: null is unknown, undefined is no robot (or none loaded yet). */
  batteryPct?: number | null
}): RunBlocker[] {
  const out: RunBlocker[] = []
  if (!x.robotId) out.push('noRobot')
  else if (x.youHoldControl) out.push('releaseControl')
  else if (!robotFreeForRun(x.availability, x.controlOwner)) out.push('robotUnavailable')
  // Starting a mission is new work: the bridge refuses it below 15% or unknown,
  // so say so now rather than offering Ready and failing. A null
  // (unknown) reading is left to the bridge.
  if (x.robotId && belowNewWorkLine(x.batteryPct)) out.push('batteryLow')
  if (x.programErrors > 0) out.push('programErrors')
  if (x.missionErrors > 0) out.push('missionErrors')
  if (x.running) out.push('running')
  return out
}

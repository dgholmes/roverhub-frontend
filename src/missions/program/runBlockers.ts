import type { RobotAvailability } from '@/missions/robotAvailability'
import type { ValidationIssue } from '@/types'

/** Why Run is disabled. The UI translates these (`missions.program.run.blocker.*`). */
export type RunBlocker = 'noRobot' | 'robotUnavailable' | 'programErrors' | 'missionErrors' | 'noControl' | 'running'

/** Mission checks about the drawn route or the schedule, which a program run
 * does not use: a program mission runs its program, not its waypoints, and a
 * run started now is not the scheduled one. */
const NOT_FOR_PROGRAM_RUN = new Set(['noWaypoints', 'robotBooked'])

/** The mission's errors that stop its program running now. */
export function programRunMissionErrors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error' && !i.waypoint_id && !NOT_FOR_PROGRAM_RUN.has(i.code))
}

/** Whether the robot is free for this operator. Holding control makes a robot
 * "in use" — by us, which is what a run needs. A low battery or a warm motor
 * is a warning, not a reason to refuse; anything else that needs attention is. */
export function robotFreeForRun(a: RobotAvailability | undefined, ownsControl: boolean): boolean {
  if (!a) return false
  if (a.status === 'available') return true
  if (a.status === 'inUse') return ownsControl
  if (a.status === 'attention') return a.attention?.severity === 'warning' && (a.attention.kind === 'batteryLow' || a.attention.kind === 'motorHot')
  return false
}

/** Every reason Run is disabled, in the order the run bar reports them. */
export function runBlockers(x: {
  robotId: string | undefined
  availability: RobotAvailability | undefined
  ownsControl: boolean
  programErrors: number
  missionErrors: number
  running: boolean
}): RunBlocker[] {
  const out: RunBlocker[] = []
  if (!x.robotId) out.push('noRobot')
  else if (!robotFreeForRun(x.availability, x.ownsControl)) out.push('robotUnavailable')
  if (x.programErrors > 0) out.push('programErrors')
  if (x.missionErrors > 0) out.push('missionErrors')
  if (x.robotId && !x.ownsControl) out.push('noControl')
  if (x.running) out.push('running')
  return out
}

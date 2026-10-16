import { robotAttention, type Attention } from '@/fleet/attention'
import { reachabilityOf } from '@/lib/connectivityHealth'
import type { Mission, RobotState } from '@/types'

export type AvailabilityStatus = 'available' | 'onMission' | 'inUse' | 'attention' | 'offline'

/** Display order of the picker's groups: free robots first. */
export const AVAILABILITY_ORDER: AvailabilityStatus[] = ['available', 'onMission', 'inUse', 'attention', 'offline']

export interface RobotAvailability {
  status: AvailabilityStatus
  /** The mission the robot is on, when status is onMission. */
  mission?: Mission
  /** What needs attention, when status is attention. */
  attention?: Attention
}

/**
 * Whether a robot can take a mission right now, for the mission editor's
 * robot picker. Order matters: an unreachable robot is offline whatever else
 * is true; a fallen or faulted robot needs attention even mid-mission; then
 * a running mission; then someone driving it.
 *
 * "Not available" never stops a robot being chosen: missions are often
 * planned for later, when it will be free. It only adds a warning.
 */
export function robotAvailability(robot: RobotState, mission?: Mission, now = Date.now()): RobotAvailability {
  if (reachabilityOf(robot) !== 'online') return { status: 'offline' }
  const attention = robotAttention(robot, now)
  if (attention && attention.severity === 'critical') return { status: 'attention', attention }
  if ((mission && (mission.status === 'active' || mission.status === 'paused')) || robot.abstract_state === 'AUTO_MISSION') {
    return { status: 'onMission', mission }
  }
  if (robot.control_owner || robot.abstract_state === 'MANUAL') return { status: 'inUse' }
  if (attention) return { status: 'attention', attention }
  return { status: 'available' }
}

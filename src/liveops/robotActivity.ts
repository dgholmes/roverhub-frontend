import i18n from '@/i18n'
import { reachabilityLabel, reachabilityOf } from '@/lib/connectivityHealth'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { Mission, RobotState } from '@/types'

export type ActivityTone = 'state' | 'warn' | 'critical' | 'muted'

export interface RobotActivity {
  /** The short answer to "what is this robot doing right now?" */
  text: string
  /** How to colour it. `state` means "in the robot's state colour". */
  tone: ActivityTone
}

/**
 * One line per robot for the robot list: enough to know what each robot is
 * doing without opening it, and nothing the selected robot's telemetry panel
 * already says at greater length.
 *
 * Ordered by what an operator must not miss: connectivity first (a frozen
 * last-known state must never read as live), then emergencies, then a fall,
 * then what the robot is actively doing.
 */
export function robotActivity(robot: RobotState, mission?: Mission): RobotActivity {
  const reach = reachabilityOf(robot)
  if (reach !== 'online') return { text: reachabilityLabel(reach, true), tone: 'warn' }

  if (robot.abstract_state === 'E_STOP') return { text: i18n.t('liveops.activity.estop'), tone: 'critical' }
  if (robot.abstract_state === 'FAULT') return { text: i18n.t('liveops.activity.fault'), tone: 'critical' }
  if (robot.posture === 'fallen') return { text: i18n.t('liveops.activity.fallen'), tone: 'critical' }

  const label = stateVisualFor(robot.abstract_state, robot.sdk_state).label

  if (robot.abstract_state === 'MANUAL' || robot.abstract_state === 'ASSISTED') {
    return { text: robot.control_owner ? i18n.t('liveops.activity.drivenBy', { owner: robot.control_owner }) : label, tone: 'state' }
  }

  const onMission = robot.abstract_state === 'AUTO_MISSION'
    || robot.abstract_state === 'RETURNING'
    || robot.abstract_state === 'DOCKING'
  if (onMission && mission) {
    const step = `${Math.min(mission.current_waypoint_index + 1, mission.waypoints.length)}/${mission.waypoints.length}`
    // Progress first, so it survives truncation of a long mission name.
    return { text: `${step} · ${mission.name}`, tone: 'state' }
  }

  return { text: label, tone: 'state' }
}

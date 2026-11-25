import { getCommandAvailability } from '@/liveops/commandPolicy'
import { isMissionOwner, isNavOwner } from '@/liveops/controlOwner'
import type { AbstractState, RobotState } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import { offsetConfident } from './lidarMount'
import type { TurnBlock } from './turnRunner'

/**
 * When Sensors' "turn it for me" may start, and why not. The robot must be
 * online and standing, this operator must hold control (`control_owner` is
 * their user id, as LiveOps decides it), calibration must be measuring, and
 * no mission run or tapped nav goal may be using the robot. Otherwise the
 * button stays off with the one reason.
 */

/** The abstract states a robot stands in. STAND is balance_stand; a person
 * driving reads MANUAL (or ASSISTED), and a quad settles back to STAND
 * between moves while still under their control. */
export const STANDING_STATES: ReadonlySet<AbstractState> = new Set<AbstractState>(['STAND', 'MANUAL', 'ASSISTED'])

export const isStanding = (robot: Pick<RobotState, 'abstract_state' | 'posture'>): boolean =>
  STANDING_STATES.has(robot.abstract_state) && robot.posture !== 'fallen'

export type TurnGateReason =
  | 'offline' | 'off' | 'done' | 'mission' | 'nav' | 'takeControl' | 'otherHasControl' | 'notStanding'

export type TurnGate =
  | { ok: true }
  /** `canTake`: nobody holds control and Take control is allowed, so the
   * page may offer it right there. `owner`: who holds it instead
   * (otherHasControl), so the page can name them. */
  | { ok: false; reason: TurnGateReason; canTake?: boolean; owner?: string }
  /** The command policy's own refusal for ROTATE (battery, E-Stop, fault). */
  | { ok: false; reason: 'policy'; text: string }

export function turnGate(
  robot: RobotState,
  status: Pick<LidarMountStatus, 'mode' | 'measured'>,
  me: string,
): TurnGate {
  if (robot.connectivity.bridge_state !== 'connected') return { ok: false, reason: 'offline' }
  if (status.mode === 'off') return { ok: false, reason: 'off' }
  if (offsetConfident(status.measured)) return { ok: false, reason: 'done' }
  const owner = robot.control_owner
  if (robot.active_run != null || isMissionOwner(owner) || robot.abstract_state === 'AUTO_MISSION') {
    return { ok: false, reason: 'mission' }
  }
  if (robot.nav_goal?.state === 'active' || robot.nav_goal?.state === 'stuck' || isNavOwner(owner)) return { ok: false, reason: 'nav' }
  if (owner !== me) {
    if (owner != null) return { ok: false, reason: 'otherHasControl', owner }
    return { ok: false, reason: 'takeControl', canTake: getCommandAvailability(robot, 'TAKE_CONTROL').enabled }
  }
  if (!isStanding(robot)) return { ok: false, reason: 'notStanding' }
  const policy = getCommandAvailability(robot, 'ROTATE')
  if (!policy.enabled) return { ok: false, reason: 'policy', text: policy.reason ?? '' }
  return { ok: true }
}

/** Asked before every turn of a run: what ends it. */
export function turnBlock(robot: RobotState | null | undefined, me: string): TurnBlock | null {
  if (!robot || robot.connectivity.bridge_state !== 'connected') return 'offline'
  if (robot.control_owner !== me) return 'lostControl'
  if (!isStanding(robot)) return 'notStanding'
  return null
}

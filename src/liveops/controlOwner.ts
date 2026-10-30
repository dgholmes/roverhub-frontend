import { OPERATOR_ID } from '@/lib/realtime/operator'
import type { RobotState } from '@/types'

/** True when a mission run, not a person, holds control (`mission:<run_id>`). */
export function isMissionOwner(owner: string | null | undefined): boolean {
  return typeof owner === 'string' && owner.startsWith('mission:')
}

/** Does this operator hold control of the robot?
 *
 * The one predicate for mounting the manual-control drive overlay and arming its
 * 60 s auto-release deadman. It used to be `control_owner != null`, which was
 * right only while a person was the only thing that could hold control. A
 * running edge mission holds it as `mission:<run_id>`: mounting the drive pad
 * then would offer driving that fights the program, and the deadman's plain
 * RELEASE_CONTROL would be refused (REJECTED_MISSION_HOLDS_CONTROL). */
export function operatorHoldsControl(robot: Pick<RobotState, 'control_owner'> | undefined): boolean {
  return robot?.control_owner === OPERATOR_ID
}

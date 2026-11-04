/**
 * Space in manual control: a tap stops the robot at once, and holding it on
 * for ESTOP_HOLD_MS fires the E-Stop -- the same hold the on-screen E-Stop
 * button uses, through the same reducer (@/liveops/estopHold), so the two
 * cannot drift apart. Holding is required because E-Stop here is `passive`:
 * the robot collapses and needs Release E-Stop to recover, which a stray key
 * press must never cause. Esc is not used: the browser keeps it for leaving
 * pointer lock and the page may never see it.
 */
import type { EstopHoldEvent, EstopHoldState } from '@/liveops/estopHold'
import type { RobotState } from '@/types'

export function isSpaceKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar'
}

/** What to dispatch from outside the key events: the robot reaching E_STOP
 * confirms a sent hold, and a finished hold resets once Space is up, so a
 * still-held key cannot start another. */
export function spaceHoldFollowUp(
  hold: EstopHoldState,
  robotState: RobotState['abstract_state'],
  keyDown: boolean,
): EstopHoldEvent | null {
  if (hold.phase === 'sent' && robotState === 'E_STOP') return { type: 'CONFIRMED' }
  if ((hold.phase === 'confirmed' || hold.phase === 'failed') && !keyDown) return { type: 'RESET' }
  return null
}

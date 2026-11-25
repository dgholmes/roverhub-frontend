import i18n from '@/i18n'
import { userNameOf, useUserNames } from '@/lib/auth/useUserNames'
import { currentOperatorId } from '@/lib/realtime/operator'
import type { RobotState } from '@/types'

/** True when a mission run, not a person, holds control (`mission:<run_id>`). */
export function isMissionOwner(owner: string | null | undefined): boolean {
  return typeof owner === 'string' && owner.startsWith('mission:')
}

/** True when a tapped nav goal, not a person, holds control (`nav:<goal_id>`).
 * The bridge's own label for the walk it is running: the robot reads MANUAL
 * throughout, but nobody is driving it, and anyone may take it over. */
export function isNavOwner(owner: string | null | undefined): boolean {
  return typeof owner === 'string' && owner.startsWith('nav:')
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
  return robot?.control_owner === currentOperatorId()
}

/** True when a person holds control: anything but nobody, a mission or a walk. */
export function isPersonOwner(owner: string | null | undefined): owner is string {
  return typeof owner === 'string' && owner !== '' && !isMissionOwner(owner) && !isNavOwner(owner)
}

/** Who holds control, in words for a sentence: "you", "a mission", "a walk to
 * a goal", or the person's name. Operators asked who, not just "someone": the
 * id is a user id (user-56306e3a014d) that means nothing to a reader, so it
 * is named from the user-names cache, and stays the id only until the name
 * arrives (or when the backend does not know it). `meId` null names you too,
 * for a field that shows a name rather than a sentence. */
export function controlHolderName(owner: string, meId: string | null = currentOperatorId()): string {
  if (isMissionOwner(owner)) return i18n.t('liveops.controlHolder.mission')
  if (isNavOwner(owner)) return i18n.t('liveops.controlHolder.walk')
  if (meId !== null && owner === meId) return i18n.t('liveops.controlHolder.you')
  return userNameOf(owner)
}

/** For a component that shows controlHolderName's words: asks for the people
 * among `owners` and re-renders when their names arrive. */
export function useControlHolderNames(owners: readonly (string | null | undefined)[]): void {
  useUserNames(owners.filter(isPersonOwner))
}

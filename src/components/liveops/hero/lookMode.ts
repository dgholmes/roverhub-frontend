import type { Direction } from './manualControlMath'

/** While looking around the robot stands still, so held keys drive nothing; a
 * stray key must not walk it off mid-look. Key state is still tracked through
 * the look, so on release exactly the keys still held resume driving. */
export function driveDirectionsDuringLook(held: Set<Direction>, looking: boolean): Set<Direction> {
  return looking ? new Set() : held
}

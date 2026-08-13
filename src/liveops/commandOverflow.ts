/** Splitting the LiveOps command row into inline buttons and an overflow menu.
 *
 * Why this exists: the command row cannot fit every button at every window
 * width, and every previous answer to that lost a control silently.
 *
 * Originally all buttons sat in one non-wrapping row that needed ~1340px inside
 * an `overflow: hidden` ancestor, so below that width it clipped from the right
 * and took the E-Stop -- its last child -- with it (~9px visible at 1280px,
 * gone entirely at 1024px). Audit A-01 anchored the E-Stop in its own
 * non-shrinking slot and made the rest scroll horizontally, which fixed the
 * E-Stop and moved the problem: Speak became the last child of the scroll
 * group, so Speak was what disappeared instead -- rendered, off-screen, with no
 * visible affordance that the row scrolled at all.
 *
 * An overflow menu is the fix rather than a third reshuffle: a button is either
 * on the row or listed in a menu that announces itself, and nothing is ever
 * merely out of view. Which buttons get demoted is a deliberate, reviewable
 * decision (see CurrentTaskBar's OVERFLOW_COMMANDS) rather than a consequence
 * of measured widths -- width-driven demotion would move controls around under
 * the operator's cursor as the window resized, which is its own hazard on a
 * bar that carries robot commands.
 */
import type { CommandType } from '@/types'

/**
 * Splits `buttons` into those that stay on the row and those that move into the
 * overflow menu, preserving declaration order within each group.
 *
 * `demoted` names the command types to move. An empty `overflow` result is
 * meaningful: the caller must then render no trigger at all, because a "..."
 * button opening an empty menu advertises hidden controls that do not exist.
 */
export function partitionCommandButtons<T extends { type: CommandType }>(
  buttons: readonly T[],
  demoted: ReadonlySet<CommandType>,
): { inline: T[]; overflow: T[] } {
  const inline: T[] = []
  const overflow: T[] = []
  for (const button of buttons) {
    if (demoted.has(button.type)) overflow.push(button)
    else inline.push(button)
  }
  return { inline, overflow }
}

import type { Command } from '@/types'

/**
 * Which command toasts survive when more arrive than fit on screen.
 *
 * The store previously trimmed with a flat `slice(0, 5)` — pure recency. So
 * five quick posture taps silently pushed a failed E-Stop off the screen, and
 * the operator was left believing a stop they were never told about had
 * landed. (A code comment claimed completed toasts were evicted first; nothing
 * implemented that.)
 *
 * Failures are not transient information: they persist until the operator
 * dismisses them. Successes and in-flight commands are, so they compete for a
 * fixed number of slots. docs/audit/2026-08-12-ui-ux-audit.md P1-3.
 */

/** In-flight and successful commands — recency is the right rule for these. */
export const MAX_TRANSIENT_TOASTS = 5

/** Failures persist until dismissed, but a command failing in a loop must not
 * be able to bury the viewport. */
export const MAX_FAILURE_TOASTS = 4

function isFailure(command: Command): boolean {
  return command.current_stage === 'execution_failed' || command.current_stage === 'timed_out'
}

/** `commands` is newest-first, as the store maintains it. Relative order is
 * preserved so the display does not reshuffle when something fails. */
export function retainCommands(commands: Command[]): Command[] {
  let transient = 0
  let failures = 0
  return commands.filter((command) => {
    if (isFailure(command)) return ++failures <= MAX_FAILURE_TOASTS
    return ++transient <= MAX_TRANSIENT_TOASTS
  })
}

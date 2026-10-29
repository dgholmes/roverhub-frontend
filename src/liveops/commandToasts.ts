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
 * Failures stay longer than successes (see autoDismissMs) and get their own
 * slots, so a run of successes cannot push one off screen. Successes and
 * in-flight commands compete for a fixed number of slots. docs/audit/2026-08-12-ui-ux-audit.md P1-3.
 */

/** In-flight and successful commands — recency is the right rule for these. */
export const MAX_TRANSIENT_TOASTS = 5

/** Failures persist until dismissed, but a command failing in a loop must not
 * be able to bury the viewport. */
export const MAX_FAILURE_TOASTS = 4

/** How long a toast stays before dismissing itself; null means until the
 * operator closes it.
 *
 * Failures used to persist until dismissed, every one of them. In practice that
 * left routine failures (a rejected gesture, a light that timed out) stacked
 * over the video for the rest of the session, so they now fade too, just more
 * slowly than successes. They are not lost: the Logs panel and the session
 * timeline keep every terminal ack. The exception is the stop path -- a failed
 * E-Stop or Release E-Stop is the one failure an operator must never miss, so
 * it still waits to be dismissed. */
export const COMPLETED_TOAST_MS = 4000
export const CANCELLED_TOAST_MS = 2000
export const FAILURE_TOAST_MS = 12000
const STICKY_FAILURE_TYPES = new Set<Command['type']>(['ESTOP', 'RESET_ESTOP'])

export function autoDismissMs(command: Command): number | null {
  switch (command.current_stage) {
    case 'execution_completed': return COMPLETED_TOAST_MS
    case 'cancelled': return CANCELLED_TOAST_MS
    case 'execution_failed':
    case 'timed_out':
      return STICKY_FAILURE_TYPES.has(command.type) ? null : FAILURE_TOAST_MS
    default: return null
  }
}

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

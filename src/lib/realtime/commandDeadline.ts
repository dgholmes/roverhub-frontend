import type { CommandType } from '@/types'

/** Budgets for an ack that never arrives. Safety-class commands get the short
 * one: an operator who has pressed E-Stop needs to know within seconds that it
 * did not land. See `realDataProvider.ts` for the rationale. */
export const SAFETY_ACK_TIMEOUT_MS = 5_000
export const ROUTINE_ACK_TIMEOUT_MS = 15_000

/** Slack on top of the expected motion time for commands the bridge runs to
 * completion before acking. */
const LONG_COMMAND_MARGIN_MS = 30_000

/** Speed ratio (%) assumed when the robot's live ratio is unknown. Low on
 * purpose: it errs towards a longer deadline. */
const ASSUMED_SPEED_RATIO_PCT = 10

/** Commands whose failure the operator must learn about immediately. */
export const SAFETY_COMMAND_TYPES = new Set<CommandType>(['ESTOP', 'RESET_ESTOP', 'RELEASE_CONTROL'])

/** Commands the bridge holds open while the robot moves or performs.
 * TAKE_CONTROL is one: the bridge runs its stand-up chain before acking. */
const LONG_COMMAND_TYPES = new Set<CommandType>([
  'LINE_WALK', 'ROTATE', 'CIRCLE', 'DYNAMIC_POSE', 'STATIC_POSE', 'SET_STATE', 'SPEAK', 'TAKE_CONTROL',
])

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Seconds of motion a command is expected to take, with no margin. */
export function expectedDurationS(
  type: CommandType,
  params?: Record<string, unknown>,
  speedRatioPct?: number,
): number {
  const ratio =
    typeof speedRatioPct === 'number' && Number.isFinite(speedRatioPct) && speedRatioPct > 0
      ? speedRatioPct
      : ASSUMED_SPEED_RATIO_PCT
  switch (type) {
    case 'LINE_WALK':
      return Math.abs(num(params?.distance)) / (0.5 * (ratio / 100))
    case 'ROTATE':
      return Math.abs(num(params?.angle)) / 45
    case 'CIRCLE':
      return Math.abs(num(params?.turns)) * 8
    case 'DYNAMIC_POSE':
    case 'STATIC_POSE':
      return Math.abs(num(params?.duration))
    default:
      return 0
  }
}

/** How long the browser waits for a terminal ack before giving up. Matches the
 * bridge's own allowance so a long move is not declared lost mid-walk. */
export function ackDeadlineMs(
  type: CommandType,
  params?: Record<string, unknown>,
  speedRatioPct?: number,
): number {
  // Release from `passive` runs a chain on the bridge -- re-assert passive,
  // `ready`, then stand up -- each step bounded at 10 s. A working Release took
  // 6.3 s on 2026-10-28 and was reported "timed out" at 5 s while the robot
  // stood up. Same allowance as TAKE_CONTROL, whose chain is the same shape.
  if (type === 'RESET_ESTOP') return LONG_COMMAND_MARGIN_MS + 5_000
  if (SAFETY_COMMAND_TYPES.has(type)) return SAFETY_ACK_TIMEOUT_MS
  // The bridge allows itself exactly 30 s for the stand-up chain and its clock
  // starts after ours; 5 s more keeps us from giving up just before it acks.
  if (type === 'TAKE_CONTROL') return LONG_COMMAND_MARGIN_MS + 5_000
  if (LONG_COMMAND_TYPES.has(type)) {
    return LONG_COMMAND_MARGIN_MS + 1000 * expectedDurationS(type, params, speedRatioPct)
  }
  return ROUTINE_ACK_TIMEOUT_MS
}

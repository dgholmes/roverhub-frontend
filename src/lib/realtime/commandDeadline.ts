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
 * TAKE_CONTROL is one: the bridge runs its stand-up chain before acking.
 * SET_GAIT is a state transition exactly like SET_STATE, and the bridge gives
 * it the same 30 s. */
const LONG_COMMAND_TYPES = new Set<CommandType>([
  'LINE_WALK', 'ROTATE', 'CIRCLE', 'DYNAMIC_POSE', 'STATIC_POSE', 'SET_STATE', 'SET_GAIT', 'SPEAK',
  'TAKE_CONTROL', 'BALANCE_AXIS', 'VELOCITY_SEQUENCE', 'BALANCE_SEQUENCE',
])

/** Seconds the bridge waits after reaching a gesture state, while the gesture
 * runs. Mirrors `STATE_SETTLE_S` and `ATOMIC_ACTION_SETTLE_S` in
 * roverhub-edge's `dobot_adapter.py`, which tests check against the vendored
 * SDK; change both together. `wave` is absent on purpose: it is held until sent
 * again, so its command acks after the default settle. */
export const STATE_SETTLE_S: Readonly<Record<string, number>> = {
  gongxi: 11.5,
  choreo: 11.5,
  dance0: 126.5,
  jump: 3.0,
  recovery: 4.0,
  // SDK v1.3.0 choreography moves: run length plus ~1 s.
  twirl_jump: 2.0,
  diag_step: 7.0,
  hop_step: 4.0,
  groove: 9.0,
  bounce: 7.0,
  body_wave: 9.0,
  hip_circle: 9.0,
  head_circle: 9.0,
}

/** Index of the duration in each sequence step, as the bridge reads it:
 * VELOCITY_SEQUENCE steps are (vx, vy, vyaw, duration), BALANCE_SEQUENCE steps
 * (motion_id, value, duration, mode). */
const STEP_DURATION_INDEX: Partial<Record<CommandType, number>> = {
  VELOCITY_SEQUENCE: 3,
  BALANCE_SEQUENCE: 2,
}

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
    case 'BALANCE_AXIS':
      return Math.abs(num(params?.duration))
    case 'SET_STATE':
      return typeof params?.state === 'string' ? STATE_SETTLE_S[params.state] ?? 0 : 0
    case 'VELOCITY_SEQUENCE':
    case 'BALANCE_SEQUENCE': {
      const index = STEP_DURATION_INDEX[type]!
      const steps = Array.isArray(params?.steps) ? params.steps : []
      return steps.reduce<number>((sum, step) => sum + (Array.isArray(step) ? Math.abs(num(step[index])) : 0), 0)
    }
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
  // Release control acks only after the bridge's release path
  // (roverhub-edge robot_bridge/command_sender.py, RELEASE_CONTROL):
  // stop_all_motion, then set_state to the recovery state -- balance_stand on
  // quad, `ready` (a slow lie-down) on wheel -- then release_control. It runs
  // under the same per-command budget as TAKE_CONTROL's stand-up (cmd_timeout_s,
  // 30 s, plus no declared duration), so it gets the same allowance. At the
  // safety 5 s, a release that worked was reported failed on 2026-10-30, and
  // that timeout put this operator back in control of a robot nobody held.
  if (type === 'RELEASE_CONTROL') return LONG_COMMAND_MARGIN_MS + 5_000
  if (SAFETY_COMMAND_TYPES.has(type)) return SAFETY_ACK_TIMEOUT_MS
  // The bridge allows itself exactly 30 s for the stand-up chain and its clock
  // starts after ours; 5 s more keeps us from giving up just before it acks.
  if (type === 'TAKE_CONTROL') return LONG_COMMAND_MARGIN_MS + 5_000
  // START_MISSION acks once the run is running, after the executor's warm-up
  // (the same stand-up chain), and the backend fails an unanswered one at 30 s.
  if (type === 'START_MISSION') return LONG_COMMAND_MARGIN_MS + 5_000
  if (LONG_COMMAND_TYPES.has(type)) {
    return LONG_COMMAND_MARGIN_MS + 1000 * expectedDurationS(type, params, speedRatioPct)
  }
  return ROUTINE_ACK_TIMEOUT_MS
}

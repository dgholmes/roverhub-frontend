import i18n from '@/i18n'
import { capabilitiesFor } from '@/lib/robotCapabilities'
import type { AbstractState, GaitMode, RobotState, RobotType } from '@/types'

/**
 * Pure decision logic for the posture buttons, the manual-drive gait picker,
 * and the wheel-only quick actions. Extracted from the components for the same
 * reason `manualControlMath.ts` was: this project's Vitest setup runs in a node
 * environment with no DOM, so logic that lives inside JSX can't be tested.
 * Components stay thin renderers over these.
 */

export interface PostureAction {
  /** Which posture this is, independent of the (translated) label -- what
   * components key icons off. */
  kind: 'stand' | 'sit' | 'safeStop' | 'recovery'
  /** SDK state name sent as SET_STATE's `state` param. */
  state: string
  /** In the current language. */
  label: string
  /** Physically consequential enough to need an explicit confirm step. */
  requiresConfirmation: boolean
  /** Shown in the confirm dialog. Empty when no confirmation is needed. */
  confirmation: string
}

/**
 * Stand / Sit / Passive, resolved per robot type.
 *
 * Stand is `balance_stand` on quad and `wheel_loco` on wheel. It was
 * previously `ready` for wheel, on the strength of docs/03-sdk-integration.md
 * §7.2 calling `ready` "controller active, wheels down" — the vendored SDK says
 * 缓慢趴下（安全停止）, a slow lie-down. Do not reintroduce `ready` as a stand
 * target; it is a safe-stop/warm-up step only.
 */
export function postureActionsFor(robotType: RobotType | undefined): PostureAction[] {
  const caps = capabilitiesFor(robotType)
  return [
    {
      kind: 'stand',
      state: caps.standState,
      label: i18n.t('command.posture.stand'),
      requiresConfirmation: false,
      confirmation: '',
    },
    {
      kind: 'sit',
      state: caps.sitState,
      label: i18n.t('command.posture.sit'),
      requiresConfirmation: false,
      confirmation: '',
    },
    // Safe stop is `ready`: a slow lie-down with the motors still on. This
    // button used to send `passive`, which on the robots' current firmware is
    // their E-Stop state -- once there, no SDK command can bring them back,
    // only the handheld remote (measured 2026-10-26, both robots). The bridge
    // now refuses SET_STATE passive outright (REJECTED_PASSIVE_IS_ESTOP), so
    // nothing in the UI may offer it.
    {
      kind: 'safeStop',
      state: caps.safeStopState,
      label: i18n.t('command.posture.safeStop'),
      requiresConfirmation: false,
      confirmation: '',
    },
  ]
}

export interface GaitOption {
  gait: GaitMode
  label: string
  active: boolean
}

export interface GaitPickerModel {
  /**
   * 'toggle' when the type has a real choice of gaits; 'static' when it has
   * exactly one, where a single-button toggle group would imply a choice that
   * doesn't exist. Wheel mode has only `wheel_loco`.
   */
  kind: 'toggle' | 'static'
  options: GaitOption[]
}

export function gaitPickerModelFor(robot: Pick<RobotState, 'robot_type' | 'gait'>): GaitPickerModel {
  const caps = capabilitiesFor(robot.robot_type)
  const options = caps.velocityGaits.map((gait) => ({
    gait,
    label: i18n.t(`misc.gait.${gait}`),
    active: robot.gait === gait,
  }))
  return { kind: options.length > 1 ? 'toggle' : 'static', options }
}

/** Motion ids that must never appear as a one-tap quick action, because they
 * have dedicated UI elsewhere or must not be operator-reachable at all. */
const NON_GESTURE_MOTION_IDS = new Set([
  // Postures -- PostureButtons exposes these directly.
  'stand_down', 'balance_stand', 'ready', 'passive',
  // Legacy alias of `gongxi`, excluded because firmware reports BOTH names
  // after the v1.3.0 rename. This list is what gets filtered out of
  // available_motions, and GESTURE_IDS only chooses labels -- so without this
  // the operator sees two buttons for one motion, "Gongxi" and a prettified
  // "Choreo". Dropping the alias here rather than from GESTURE_IDS keeps the
  // old name recognised everywhere it is *read back* (state_machine's
  // ACTIVE_MOTION_SDK_STATES, the ack stream, the Logs panel).
  'choreo',
  // Fall recovery -- has dedicated UI in two places (a contextual action in
  // LiveOps when posture is 'fallen', and a permanent Get up button in
  // Fleet's robot header). It must not also appear as a novelty gesture
  // beside Dance and Backflip. It was previously listed above as though
  // PostureButtons exposed it, which it never did -- that comment is why the
  // action had no UI at all.
  'recovery',
  // Continuous gaits and their velocity-sequence forms -- driven via
  // ManualControlOverlay, not a one-tap action.
  'walk', 'wheel_loco', 'walk_velocity_seq', 'flying_trot_velocity_seq',
  'rl_velocity_seq', 'wheel_loco_velocity_seq',
  // Fine movement -- Fleet > robot > Motion tests.
  'line_walk', 'rotation',
  // Balance/pose -- Fleet > robot > Motion tests.
  'balance_pitch', 'balance_yaw', 'balance_roll', 'balance_height', 'balance_neutral',
  'dynamic_pose', 'static_pose',
  // Mode-switching -- Fleet > robot > Motion tests.
  'change_mode',
  // Never exposed to operators (engineering-only, docs/03-sdk-integration.md §9.1/§9.2).
  'kill_robot',
])

/**
 * Physically dramatic motions that need an explicit confirm step. `handstand`
 * inverts the robot and `climb` drives it at an obstacle; both were
 * hardware-unverified as of 2026-08-04. `drift` dispatches on one tap like the
 * quad gestures.
 */
const CONFIRM_REQUIRED_MOTION_IDS = new Set(['handstand', 'climb'])

// `gongxi` replaced `choreo` in SDK v1.3.0. Firmware reports BOTH names in
// available_motions, so listing both here would render two buttons for one
// action -- only the current name belongs in this list.
const GESTURE_IDS = [
  'wave', 'dance0', 'jump', 'gongxi', 'flying_trot', 'rl', 'backflip', 'drift', 'climb', 'handstand',
] as const
type GestureId = typeof GESTURE_IDS[number]

function isLabelledGesture(id: string): id is GestureId {
  return (GESTURE_IDS as readonly string[]).includes(id)
}

/** Labels live in the `command.gestures` dictionary (English: Wave, Dance,
 * Jump, Gongxi, Flying Trot, RL Gait, Backflip, Drift, Climb, Handstand).
 *
 * `gongxi` is labelled "Gongxi", NOT "Bow" and no longer "Choreo". SDK v1.3.0
 * renamed the `choreo` state to `gongxi` "to better reflect the motion
 * semantics", which is strong evidence for what the Bow question was really
 * about: 恭喜 is a congratulation, performed with cupped hands and a bow -- so
 * the controller card's "Bow" and v1.2.0's "Robot Bow / Choreo Action" title
 * were probably describing this motion all along. Probably, not certainly:
 * Dobot has still never said so, so the open question stands (see
 * docs/09-ros2-slam-nav2-plan.md section 7) and the label still follows the
 * rule that settled it before -- use the name every other surface uses. The
 * robots report BOTH `choreo` and `gongxi` in available_motions, and the ack
 * stream, Logs panel and bridge logs all carry whichever name was dispatched,
 * so the UI must not invent a third.
 *
 * ⚠️ The Korean label is currently the romanisation, not a translation. 안무
 * ("choreography") is now wrong, and the right Korean word depends on whether
 * Bow is confirmed. Worth a native pass. */
function gestureLabel(id: string): string {
  return isLabelledGesture(id) ? i18n.t(`command.gestures.${id}`) : prettifyMotionId(id)
}

export function prettifyMotionId(id: string): string {
  return id.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export interface QuickAction {
  id: string
  label: string
  requiresConfirmation: boolean
}

/**
 * Quick actions for a robot, driven live from `available_motions` (the edge
 * bridge's real get_motions() response, reported every heartbeat) rather than a
 * hardcoded list — a firmware/SDK update can add motions, and quad and wheel
 * robots report different sets.
 *
 * Wheel robots used to be excluded wholesale, which hid their three real canned
 * motions (drift/climb/handstand). They're included now; the filtering below is
 * type-agnostic because `available_motions` already reflects the hardware.
 */
export function quickActionsFor(robot: Pick<RobotState, 'available_motions'>): QuickAction[] {
  return (robot.available_motions ?? [])
    .filter((id) => !NON_GESTURE_MOTION_IDS.has(id))
    .map((id) => ({
      id,
      label: gestureLabel(id),
      requiresConfirmation: CONFIRM_REQUIRED_MOTION_IDS.has(id),
    }))
}

/**
 * Whether the Quick Actions gesture menu may be reached at all in a given
 * abstract state.
 *
 * ⚠️ This is a safety precondition, not cosmetics. `commandPolicy.ts` allows
 * `SET_STATE` wholesale in FAULT (see its `FAULT_ALLOWED` comment) so an
 * operator can still command a robot in an unrecognised state to a defined
 * posture. `getCommandAvailability` receives no params, so it cannot tell
 * `SET_STATE:passive` from `SET_STATE:backflip` — the only thing stopping a
 * gesture being dispatched in FAULT is that QuickActionsMenu does not render.
 * This predicate is what enforces that, and `commandPolicy.ts`'s comment cites
 * it by name. Do not relax it without first threading command params into
 * `getCommandAvailability`.
 *
 * Nothing else is excluded: gestures are dispatchable-but-refused elsewhere
 * (E_STOP, mid-mission) and the trigger's own disabled reason explains why,
 * which is better than a control vanishing for a recoverable reason.
 */
export function quickActionsAvailableIn(abstractState: AbstractState): boolean {
  return abstractState !== 'FAULT'
}

export function confirmationTextFor(action: QuickAction): string {
  if (action.id === 'handstand') {
    return i18n.t('command.quickActions.handstandConfirm')
  }
  if (action.id === 'climb') {
    return i18n.t('command.quickActions.climbConfirm')
  }
  return ''
}

/**
 * Fall recovery, dispatched as SET_STATE('recovery').
 *
 * No confirmation step, deliberately: every other physically dramatic motion
 * (handstand, climb) gets one because the risk is in starting it. Here the
 * robot is already on the ground and the risk is in the delay.
 */
export const RECOVERY_ACTION: PostureAction = {
  kind: 'recovery',
  state: 'recovery',
  // A getter so the label follows the current language.
  get label() { return i18n.t('command.posture.getUp') },
  requiresConfirmation: false,
  confirmation: '',
}

/**
 * Whether this robot type has a `recovery` state to be commanded into at all.
 *
 * It is in quad's `validStates` and NOT in wheel's (robotCapabilities.ts, and
 * its Python source shared/schemas/robot_capabilities.py) — a wheel robot
 * cannot get itself up, and `safety_manager` rejects the attempt with
 * REJECTED_STATE_UNSUPPORTED. Offering Get Up there is a button that can only
 * fail, so both the LiveOps action and Fleet's header button hide it.
 */
export function supportsRecovery(robotType: RobotType | undefined): boolean {
  return capabilitiesFor(robotType).validStates.includes('recovery')
}

/**
 * The contextual Get Up action for LiveOps, or null when it should not show.
 *
 * Only 'fallen' qualifies. 'unknown' deliberately does not: a bridge with no
 * IMU always reports it, and an action that appeared permanently on every
 * gRPC-only robot would train operators to ignore it. Those robots reach
 * recovery through the permanent Get up button in Fleet's robot header,
 * which is why that one exists.
 *
 * Robot type is checked too: a fallen wheel robot has no `recovery` state, so
 * it gets nothing here rather than a button the bridge will reject.
 */
export function contextualRecoveryActionFor(
  robot: Pick<RobotState, 'posture' | 'robot_type'>,
): PostureAction | null {
  if (!supportsRecovery(robot.robot_type)) return null
  return robot.posture === 'fallen' ? RECOVERY_ACTION : null
}

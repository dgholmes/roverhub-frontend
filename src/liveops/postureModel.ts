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
  kind: 'stand' | 'sit' | 'passive' | 'recovery'
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
    {
      kind: 'passive',
      state: caps.passiveState,
      label: i18n.t('command.posture.passive'),
      requiresConfirmation: true,
      confirmation: i18n.t('command.posture.passiveConfirm'),
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

const GESTURE_IDS = [
  'wave', 'dance0', 'jump', 'choreo', 'flying_trot', 'rl', 'backflip', 'drift', 'climb', 'handstand',
] as const
type GestureId = typeof GESTURE_IDS[number]

function isLabelledGesture(id: string): id is GestureId {
  return (GESTURE_IDS as readonly string[]).includes(id)
}

/** Labels live in the `command.gestures` dictionary (English: Wave, Dance,
 * Jump, Choreo, Flying Trot, RL Gait, Backflip, Drift, Climb, Handstand).
 *
 * `choreo` is labelled "Choreo", NOT "Bow". The physical controller's card
 * lists a "Bow" action and Dobot's v1.2.0 release is titled "Robot Bow /
 * Choreo Action", which looks like the two are the same thing -- but that is
 * the ONLY occurrence of "bow" anywhere in the SDK. Every API surface says
 * choreo/"choreography state", and crucially the robots themselves report
 * `choreo` in available_motions, so it is also what the operator sees in the
 * Logs panel, the ack stream and the bridge logs. Labelling the button "Bow"
 * was tried and reverted: it asserted an equivalence nobody has verified, and
 * it made the UI disagree with every other surface showing the same action.
 * Open question for Dobot -- see docs/09-ros2-slam-nav2-plan.md section 7.
 * (Korean uses 안무, "choreography", for the same reason.) */
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

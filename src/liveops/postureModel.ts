import { capabilitiesFor, GAIT_LABELS } from '@/lib/robotCapabilities'
import type { GaitMode, RobotState, RobotType } from '@/types'

/**
 * Pure decision logic for the posture buttons, the manual-drive gait picker,
 * and the wheel-only quick actions. Extracted from the components for the same
 * reason `manualControlMath.ts` was: this project's Vitest setup runs in a node
 * environment with no DOM, so logic that lives inside JSX can't be tested.
 * Components stay thin renderers over these.
 */

export interface PostureAction {
  /** SDK state name sent as SET_STATE's `state` param. */
  state: string
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
      state: caps.standState,
      label: 'Stand',
      requiresConfirmation: false,
      confirmation: '',
    },
    {
      state: caps.sitState,
      label: 'Sit',
      requiresConfirmation: false,
      confirmation: '',
    },
    {
      state: caps.passiveState,
      label: 'Passive',
      requiresConfirmation: true,
      confirmation:
        'This de-energises the motors. If the robot is not already sitting it will drop '
        + 'rather than lower itself. Only confirm if it is low and stable.',
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
    label: GAIT_LABELS[gait],
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
  // LiveOps when posture is 'fallen', and a permanent control in Fleet >
  // Diagnostics > Movement). It must not also appear as a novelty gesture
  // beside Dance and Backflip. It was previously listed above as though
  // PostureButtons exposed it, which it never did -- that comment is why the
  // action had no UI at all.
  'recovery',
  // Continuous gaits and their velocity-sequence forms -- driven via
  // ManualControlOverlay, not a one-tap action.
  'walk', 'wheel_loco', 'walk_velocity_seq', 'flying_trot_velocity_seq',
  'rl_velocity_seq', 'wheel_loco_velocity_seq',
  // Fine movement -- Fleet > device drawer > Diagnostics > Movement.
  'line_walk', 'rotation',
  // Balance/pose -- Fleet > device drawer > Diagnostics > Balance.
  'balance_pitch', 'balance_yaw', 'balance_roll', 'balance_height', 'balance_neutral',
  'dynamic_pose', 'static_pose',
  // Mode-switching -- Fleet > device drawer > Diagnostics > Movement.
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

const GESTURE_LABELS: Record<string, string> = {
  wave: 'Wave', dance0: 'Dance', jump: 'Jump', choreo: 'Bow',
  flying_trot: 'Flying Trot', rl: 'RL Gait', backflip: 'Backflip',
  drift: 'Drift', climb: 'Climb', handstand: 'Handstand',
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
      label: GESTURE_LABELS[id] ?? prettifyMotionId(id),
      requiresConfirmation: CONFIRM_REQUIRED_MOTION_IDS.has(id),
    }))
}

export function confirmationTextFor(action: QuickAction): string {
  if (action.id === 'handstand') {
    return 'This inverts the robot into a handstand. Confirm only with clear space around it '
      + 'and no payload attached.'
  }
  if (action.id === 'climb') {
    return 'This drives the robot at an obstacle to climb it. Confirm only if the obstacle '
      + 'ahead is within the robot’s rated climbing height.'
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
  state: 'recovery',
  label: 'Get Up',
  requiresConfirmation: false,
  confirmation: '',
}

/**
 * The contextual Get Up action for LiveOps, or null when it should not show.
 *
 * Only 'fallen' qualifies. 'unknown' deliberately does not: a bridge with no
 * IMU always reports it, and an action that appeared permanently on every
 * gRPC-only robot would train operators to ignore it. Those robots reach
 * recovery through the permanent control in Fleet > Diagnostics > Movement,
 * which is why that one exists.
 */
export function contextualRecoveryActionFor(
  robot: Pick<RobotState, 'posture'>,
): PostureAction | null {
  return robot.posture === 'fallen' ? RECOVERY_ACTION : null
}

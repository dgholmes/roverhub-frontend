import i18n from '@/i18n'
import type { GaitMode, RobotType } from '@/types'

/**
 * TypeScript mirror of `shared/schemas/robot_capabilities.py` — per-robot-type
 * FSM facts in one place, per this project's "TS interfaces derived from
 * Pydantic" convention. Keep the two in sync; the Python side additionally has
 * a test that parses the vendored SDK and fails if the table drifts from it.
 *
 * The load-bearing fact, because getting it wrong caused two operator-visible
 * bugs: `ready` is the SDK's 缓慢趴下 — a slow, controlled lie-down used as a
 * safe stop — NOT a stand. A wheel robot's upright state is `wheel_loco`, the
 * counterpart of quad's `balance_stand`. The vendor's bring-up chains are:
 *
 *     quad   passive -> ready -> balance_stand -> walk
 *     wheel  passive -> ready -> wheel_loco
 *
 * Mapping "Stand" to `ready` is why the Stand button used to lie wheel robots
 * down, which in turn made "Sit" look like it did nothing.
 */
export interface RobotCapabilities {
  validStates: string[]
  velocityGaits: GaitMode[]
  defaultGait: GaitMode
  /** Upright + controller active. */
  standState: string
  /** Slow, controlled lie-down. Shared by both types. */
  safeStopState: string
  sitState: string
  /** Motors de-energised. The robot drops if it isn't already down. */
  passiveState: string
  /**
   * Commands the edge rejects on wheel robots with
   * REJECTED_UNSUPPORTED_ON_WHEEL (safety_manager.py). Mirrors
   * shared/schemas/commands.py::QUAD_ONLY_COMMAND_TYPES. Same list on both
   * types — it's the robot type, not the list, that decides applicability.
   */
  quadOnlyCommands: string[]
}

const QUAD_ONLY_COMMANDS = [
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
]

const SHARED = {
  safeStopState: 'ready',
  sitState: 'stand_down',
  passiveState: 'passive',
  quadOnlyCommands: QUAD_ONLY_COMMANDS,
}

export const CAPABILITIES: Record<RobotType, RobotCapabilities> = {
  quad: {
    validStates: [
      'passive', 'ready', 'stand_down', 'balance_stand', 'walk', 'flying_trot',
      'rl', 'choreo', 'dance0', 'wave', 'jump', 'backflip', 'recovery',
    ],
    velocityGaits: ['walk', 'flying_trot'],
    defaultGait: 'walk',
    standState: 'balance_stand',
    ...SHARED,
  },
  wheel: {
    validStates: [
      'passive', 'ready', 'stand_down', 'wheel_loco', 'drift', 'climb', 'handstand',
    ],
    velocityGaits: ['wheel_loco'],
    defaultGait: 'wheel_loco',
    standState: 'wheel_loco',
    ...SHARED,
  },
}

/** Quad is the fallback for an unknown or absent type: it's the original
 * hardware and the historical default, so an unrecognised value degrades to
 * prior behaviour rather than to a wheel-only command set. */
export function capabilitiesFor(robotType: RobotType | undefined): RobotCapabilities {
  return (robotType && CAPABILITIES[robotType]) || CAPABILITIES.quad
}

export const GAIT_LABELS: Record<GaitMode, string> = {
  walk: 'Walk',
  flying_trot: 'Flying Trot',
  wheel_loco: 'Wheel Loco',
}

/**
 * Operator-facing name for each robot type. Matches the vocabulary already used
 * by Fleet > Diagnostics > Foot Type ('Point Foot' / 'Wheel Foot'), which in
 * turn matches the vendor's 点足 / 轮足 and the SDK's miniQuad / miniQuadW.
 */
export const ROBOT_TYPE_LABELS: Record<RobotType, string> = {
  quad: 'Point Foot',
  wheel: 'Wheel Foot',
}

export function robotTypeLabel(robotType: RobotType | undefined): string {
  // In the current language; ROBOT_TYPE_LABELS stays the English source.
  if (!robotType) return i18n.t('common.unknown')
  return i18n.t(robotType === 'quad' ? 'misc.pointFoot' : 'misc.wheelFoot')
}

/** True when this command can't be performed by the given robot type at all,
 * so the UI should say so rather than dispatch and collect a failed ACK. */
export function isCommandUnsupported(robotType: RobotType | undefined, commandType: string): boolean {
  return robotType === 'wheel' && QUAD_ONLY_COMMANDS.includes(commandType)
}

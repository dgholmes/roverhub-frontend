/**
 * Which posture actions apply to a robot *right now*, as opposed to which ones
 * its type supports at all.
 *
 * `postureModel.ts`'s `postureActionsFor(robotType)` keeps its present meaning:
 * the three targets the hardware has (Stand, Sit, Safe stop, resolved per
 * type). This module filters that set by what the robot is actually doing, so
 * the deck stops offering Sit to a robot already lying down. It is pure and
 * DOM-free for the same reason `postureModel.ts` is: Vitest runs here in a
 * `node` environment, so logic that lives inside JSX cannot be tested.
 *
 * Two rules in here are safety rules rather than cosmetics, and both have cost
 * us before:
 *
 * 1. **An unrecognised `sdk_state` shows everything.** A state this build does
 *    not know is exactly when the operator needs Stand, Sit and Safe stop: a
 *    missing entry in a state table must degrade to "offer the controls", never
 *    to "remove them". The same mistake in `state_machine.ACTIVE_MOTION_SDK_STATES`
 *    presented as "the robot is faulty and most of my controls are gone".
 *    Hiding a control means *it cannot apply*; it never means *refused right
 *    now* -- that case is `getCommandAvailability`'s, which draws the control
 *    disabled with its reason (design 2026-11-24 §6.4, anti-goal #2).
 * 2. **`posture === 'unknown'` is not a synonym for upright.** A gRPC-only
 *    bridge has no IMU and reports `unknown` permanently, so no consumer may
 *    read it as "fine". Only `'fallen'` is acted on here; everything else
 *    falls through to the `sdk_state` classification.
 *
 * Design: docs/superpowers/specs/2026-11-24-liveops-shape-design.md §6.4.
 */
import { capabilitiesFor } from '@/lib/robotCapabilities'
import {
  contextualRecoveryActionFor,
  postureActionsFor,
  supportsRecovery,
  type PostureAction,
} from '@/liveops/postureModel'
import type { RobotState } from '@/types'

/** What the robot reads as, for the purpose of choosing posture controls.
 * `unknown` is a real answer -- see rule 1 above -- not an error case. */
export type PosturePhase = 'down' | 'up' | 'fallen' | 'unknown'

/** The states that mean "already down" for a type: its sit target, its
 * safe-stop target (`ready`, the SDK's slow lie-down -- never a stand), and
 * `passive`, which is the robot's own de-energised E-Stop state. */
function downStates(robot: Pick<RobotState, 'robot_type'>): Set<string> {
  const caps = capabilitiesFor(robot.robot_type)
  return new Set([caps.sitState, caps.safeStopState, caps.passiveState, 'passive'])
}

/**
 * Classify `robot.sdk_state` against its own type's targets.
 *
 * "Up" is everything in `validStates` that is not down -- derived rather than
 * hand-listed, so an SDK bump that adds a motion state does not silently
 * reclassify it as unrecognised. `standState` and the velocity gaits are
 * unioned in explicitly: they are the two that must be up whatever else
 * changes, and a capability table that ever omitted one from `validStates`
 * would be a worse failure than a missing gesture.
 */
export function posturePhaseOf(robot: RobotState): PosturePhase {
  if (robot.posture === 'fallen' && supportsRecovery(robot.robot_type)) return 'fallen'

  const caps = capabilitiesFor(robot.robot_type)
  const down = downStates(robot)
  if (down.has(robot.sdk_state)) return 'down'

  const up = new Set<string>([
    ...caps.validStates.filter((state) => !down.has(state)),
    caps.standState,
    ...caps.velocityGaits,
  ])
  if (up.has(robot.sdk_state)) return 'up'

  return 'unknown'
}

/**
 * The posture actions to draw for this robot, in `postureActionsFor`'s order.
 *
 * Stand and Sit are mutually exclusive by construction, which is what lets the
 * deck give them one slot: the row's width does not change when the robot
 * stands up.
 *
 * A fallen robot gets Get up and nothing else. A fallen *wheel* robot has no
 * `recovery` state, so `contextualRecoveryActionFor` returns null and it falls
 * back to its `sdk_state` phase rather than being left with no controls --
 * that case cannot reach here anyway, since `posturePhaseOf` only answers
 * `'fallen'` for a type that supports recovery, but the fallback is kept so
 * neither function can strand the operator on its own.
 */
export function applicablePostureActions(robot: RobotState): PostureAction[] {
  const phase = posturePhaseOf(robot)
  if (phase === 'fallen') {
    const recovery = contextualRecoveryActionFor(robot)
    if (recovery) return [recovery]
  }

  const actions = postureActionsFor(robot.robot_type)
  if (phase === 'down') return actions.filter((a) => a.kind === 'stand')
  if (phase === 'up') return actions.filter((a) => a.kind === 'sit' || a.kind === 'safeStop')
  return actions
}

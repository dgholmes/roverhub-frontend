import i18n from '@/i18n'
import { belowDriveFloor, belowNewWorkLine } from '@/lib/batteryRules'
import { capabilitiesFor, isCommandUnsupported } from '@/lib/robotCapabilities'
import type { CommandAvailability, CommandType, RobotState } from '@/types'
import type { RobotRunView } from './robotRun'

/**
 * Single source of truth for command-bar availability. Encodes the per-state
 * command bar rules (docs/05-ui-ux.md §5.1), the disabled-state requirements
 * (§14), and the position-freshness blocking rule (§7.3). Consumed by
 * CommandBar so availability logic isn't scattered across individual buttons.
 *
 * Assumption (not fully specified in §5.1): SNAPSHOT/SPEAK/LED_SIGNAL are
 * non-motion sensor/UX actions and remain available whenever connectivity +
 * state allow, even in states where movement commands are restricted (e.g.
 * AUTO_MISSION).
 */

const MOVEMENT_COMMANDS: CommandType[] = ['PAUSE', 'RESUME', 'RETURN', 'DOCK']

/** Commands that survive FAULT. FAULT now means only "the robot reported a
 *  state we do not recognise" -- `recovery` was removed from the bridge's
 *  FAULT_SDK_STATES, because getting up is a motion, not a failure. In an
 *  unrecognised state the operator must still be able to stop the robot and
 *  command it to a defined posture; everything else stays blocked, because we
 *  cannot reason about what is safe.
 *
 *  ⚠️ SET_STATE is allowed wholesale, not per target: this function receives no
 *  params and so cannot tell SET_STATE:passive from SET_STATE:jump. That is
 *  acceptable only because (a) no gesture has a dispatch route in FAULT --
 *  enforced by `quickActionsAvailableIn` in postureModel.ts, which
 *  QuickActionsMenu consults to return null, and covered by that module's
 *  tests -- and (b) safety_manager on the bridge is the real authority; this is
 *  an affordance filter. (a) was previously asserted here as a property of the
 *  UI that nothing actually checked, and it was false: QuickActionsMenu mounted
 *  unconditionally, so backflip/jump/handstand were one tap away in FAULT. If
 *  (a) ever stops holding again, thread params into this function rather than
 *  widening the set. */
const FAULT_ALLOWED = new Set<CommandType>(['ESTOP', 'SET_STATE'])

/** Battery tiers, mirroring safety_manager (spec 2026-10-30; thresholds in
 *  `@/lib/batteryRules`). Tier 1 (E-Stop, reset, stop speak, volume, stop
 *  mission, release control, LED, snapshot, speak, and SET_STATE to sit or safe
 *  stop) is simply absent from here: it is never gated. */
const DRIVE_FLOOR_COMMANDS = new Set<CommandType>(['TAKE_CONTROL', 'DRIVE', 'SET_GAIT', 'SET_SPEED_RATIO', 'SET_OBSTACLE_AVOIDANCE'])
const NEW_WORK_COMMANDS = new Set<CommandType>([
  'START_MISSION', 'LINE_WALK', 'ROTATE', 'CIRCLE', 'VELOCITY_SEQUENCE', 'CHANGE_MODE',
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
])

/** Params the caller is about to send, where the policy needs them: SET_STATE's
 *  tier depends on its target. Without `state`, SET_STATE is not battery-gated
 *  (a generic affordance; the bridge decides). Gesture callers pass any
 *  non-posture state. */
export interface CommandParams { state?: string }

function batteryBlock(robot: RobotState, type: CommandType, params?: CommandParams): string | null {
  const pct = robot.battery.percent
  let tier: 2 | 3 | null = null
  if (DRIVE_FLOOR_COMMANDS.has(type)) tier = 2
  else if (NEW_WORK_COMMANDS.has(type)) tier = 3
  else if (type === 'SET_STATE' && params?.state !== undefined) {
    const caps = capabilitiesFor(robot.robot_type)
    // Sit and safe stop are tier 1. So is re-sending the state the robot is in:
    // that is the gesture card's Stop, and must never be refused.
    if (params.state === caps.sitState || params.state === caps.safeStopState || params.state === robot.sdk_state) tier = null
    // Stand and the velocity gaits are how the robot is driven home.
    else tier = params.state === caps.standState || caps.velocityGaits.includes(params.state as never) ? 2 : 3
  }
  if (tier === 2 && belowDriveFloor(pct)) return i18n.t('command.policy.batteryCritical')
  if (tier === 3 && belowNewWorkLine(pct)) return i18n.t('command.policy.batteryLow')
  return null
}

/**
 * `run` is the robot's edge mission run as LiveOps sees it (useRobotRun). It is
 * optional so callers with no run view keep today's behaviour -- including
 * AUTO_MISSION blocking Take control, which then means a legacy browser run.
 * Gating on a run keys on the run view, not on abstract_state: the bridge
 * reports AUTO_MISSION for the whole of a running edge mission in any posture,
 * lying down included, so AUTO_MISSION says nothing about whether the robot
 * is standing. (Spec 2026-10-29 §5.3, §6.1.)
 */
export function getCommandAvailability(robot: RobotState, type: CommandType, run?: RobotRunView, params?: CommandParams): CommandAvailability {
  const { connectivity, abstract_state: state, position } = robot
  const runActive = run?.phase === 'running' || run?.phase === 'paused'
  const runRunning = run?.phase === 'running'

  // Bridge first: if the edge can't receive the command, nothing below can be
  // attempted at all.
  if (connectivity.bridge_state !== 'connected') {
    return { enabled: false, reason: i18n.t('command.policy.bridgeOffline') }
  }

  // E-Stop is checked BEFORE the gRPC gate, deliberately. safety_manager.check()
  // approves ESTOP unconditionally as its very first branch, so the bridge will
  // always attempt it; if the SDK link is genuinely down the operator gets a
  // failed ACK. That is strictly better than the UI refusing to let them try.
  //
  // This ordering matters more than it looks: gRPC health now degrades on stale
  // telemetry (3s), where it previously almost never left 'connected' because of
  // a mapping bug. Leaving E-Stop behind that gate would mean a brief telemetry
  // stall disables the emergency stop.
  if (type === 'ESTOP') {
    if (state === 'E_STOP') return { enabled: false, reason: i18n.t('command.policy.alreadyEstop') }
    return { enabled: true }
  }

  // Stopping audio is always allowed, and is checked before the gRPC gate for the
  // same reason E-Stop is: it travels over DDS, not gRPC, and safety_manager
  // approves it unconditionally. An operator must never be told the robot is in
  // the wrong state to be quiet -- least of all during a fault, when a blaring
  // announcement is most unwelcome.
  if (type === 'STOP_SPEAK' || type === 'SET_SPEAK_VOLUME') {
    return { enabled: true }
  }

  // Stop mission is accepted from any operator, whoever holds control, while a
  // run is running or paused (§6.5). Checked before the gRPC gate, like
  // STOP_SPEAK: safety_manager approves it unconditionally, and the executor
  // stops the run without the SDK link. Also before the E-Stop/FAULT blocks: the
  // bridge ends the run itself on either, but a stale view must not hide Stop.
  if (type === 'STOP_MISSION') {
    if (!runActive) return { enabled: false, reason: i18n.t('command.policy.noRunToStop') }
    return { enabled: true }
  }

  if (connectivity.grpc !== 'connected') {
    return { enabled: false, reason: i18n.t('command.policy.sdkLost') }
  }

  // Recoverable toggle (docs/01-prd.md §16.2: E_STOP -> STAND, "Authorized
  // reset (Operator+ with confirmation)") — the one command available while
  // E_STOP is active, checked before the blanket block below.
  if (type === 'RESET_ESTOP') {
    if (state !== 'E_STOP') return { enabled: false, reason: i18n.t('command.policy.notInEstop') }
    return { enabled: true }
  }

  // Balance/pose commands exist only in the quad FSM; safety_manager.py
  // rejects them edge-side with REJECTED_UNSUPPORTED_ON_WHEEL. Surfacing that
  // here means the operator sees a reason on the control instead of dispatching
  // a command that comes back failed. Checked after ESTOP/RESET_ESTOP above so
  // those are never gated, and before the per-state logic below since an
  // unsupported command stays unsupported in every state.
  if (isCommandUnsupported(robot.robot_type, type)) {
    return { enabled: false, reason: i18n.t('command.policy.wheelUnsupported') }
  }

  // PAUSE/RESUME/RETURN/DOCK have no executor behind them: none is wired, so
  // the real provider hands them to the mock, which reports a simulated success
  // and moves nothing. During an edge run that success would be a lie about the
  // run (Take control pauses it, Stop mission ends it), and against a real
  // backend they never do anything at all.
  if (MOVEMENT_COMMANDS.includes(type)) {
    if (runActive) return { enabled: false, reason: i18n.t('command.policy.runUseTakeControl') }
    if (import.meta.env.VITE_USE_REAL_BACKEND === 'true') {
      return { enabled: false, reason: i18n.t('command.policy.notAvailableYet') }
    }
  }

  if (state === 'E_STOP') {
    return { enabled: false, reason: i18n.t('command.policy.estopActive') }
  }
  if (state === 'FAULT' && !FAULT_ALLOWED.has(type)) {
    return { enabled: false, reason: i18n.t('command.policy.fault') }
  }

  const lowBattery = batteryBlock(robot, type, params)
  if (lowBattery) return { enabled: false, reason: lowBattery }

  // STAND counts while someone holds control: a quad settles to balance_stand
  // whenever a velocity sequence ends, i.e. on every key release. Reading that
  // as "not in manual control" dropped every move after the first release
  // while the release stops still went out, so the robot shuffled in place and
  // never walked (measured 2026-10-30, both robots).
  const inManualControl = state === 'MANUAL' || state === 'ASSISTED'
    || (state === 'STAND' && robot.control_owner != null)

  // Teleoperation control-ownership commands (docs/01-prd.md §16.2, §16.4) —
  // checked as their own group, before the per-state switch below, since
  // MANUAL/ASSISTED's generic "full command set" branch would otherwise wrongly
  // allow TAKE_CONTROL while already active, and PASSIVE/STAND/AUTO_MISSION/
  // RETURNING/DOCKING would wrongly allow driving/gait when not in either.
  if (type === 'TAKE_CONTROL') {
    // A person can always take a robot away from a running mission (§6.3):
    // the bridge approves it and pauses the run. In any posture, since the
    // run's AUTO_MISSION covers lying down too.
    if (runRunning) return { enabled: true }
    // Paused, and nobody holds control (e.g. after the 60 s auto-release).
    // Before the MANUAL check: a wheel robot standing upright reads MANUAL.
    if (run?.phase === 'paused' && run.owner === null) return { enabled: true }
    if (inManualControl) return { enabled: false, reason: i18n.t('command.policy.alreadyManual') }
    // AUTO_MISSION with no run view is a legacy browser run.
    if (state === 'AUTO_MISSION') {
      return { enabled: false, reason: i18n.t('command.policy.missionBeforeControl') }
    }
    // Allowed from PASSIVE too, not just STAND -- command_sender.py's
    // TAKE_CONTROL handler runs the full balance_stand -> walk warm-up chain
    // itself (E9's passive -> balance_stand -> walk progression) so the
    // operator doesn't have to separately click Stand first.
    if (state !== 'STAND' && state !== 'PASSIVE') {
      return { enabled: false, reason: i18n.t('command.policy.mustStand') }
    }
    return { enabled: true }
  }
  if (type === 'RELEASE_CONTROL') {
    // Release & resume while you hold a paused run, in any posture: standing
    // or sitting the robot while paused leaves MANUAL, and the operator must
    // still be able to hand the run back.
    if (run?.phase === 'paused' && run.youHoldControl) return { enabled: true }
    // The bridge refuses it while the run executes (REJECTED_MISSION_HOLDS_CONTROL);
    // Stop mission and E-Stop are the ways to hand a running mission back.
    if (runRunning) return { enabled: false, reason: i18n.t('command.policy.missionTakeControlFirst') }
    if (!inManualControl) return { enabled: false, reason: i18n.t('command.policy.notManual') }
    return { enabled: true }
  }
  if (type === 'DRIVE' || type === 'SET_GAIT') {
    if (!inManualControl) return { enabled: false, reason: i18n.t('command.policy.manualOnly') }
    return { enabled: true }
  }
  // Obstacle avoidance is a general safety toggle, not manual-control-only
  // -- the real SDK's set_obstacle_avoidance() has no such restriction, and
  // an operator should be able to toggle it any time the robot is
  // reachable (e.g. before taking manual control, not only during it).
  if (type === 'SET_OBSTACLE_AVOIDANCE') {
    return { enabled: true }
  }

  // Posture (Stand/Sit) and quick-action canned motions (LiveOps command
  // panel) share the SET_STATE command. Blocked while a mission or
  // return/dock sequence owns the robot's motion — triggering a posture
  // change or a gesture (e.g. jump, dance0) mid-mission would fight the
  // mission executor's own state transitions. Allowed under manual/assisted
  // control and while idle (PASSIVE/STAND), where nothing else is driving.
  //
  // CHANGE_MODE is held to the same guards. It matched no branch at all
  // before, so it fell through to the per-state switch and came back enabled in
  // exactly the states SET_STATE is blocked in. Switching leg configuration
  // (parallel ⇄ X-shape) mid-patrol is strictly more disruptive than a posture
  // change: it is physically consequential, it is a blind toggle the robot
  // cannot report back, and it would fight the mission executor just the same.
  if (type === 'SET_STATE' || type === 'CHANGE_MODE') {
    const legConfig = type === 'CHANGE_MODE'
    if (runRunning) return { enabled: false, reason: i18n.t('command.policy.missionTakeControlFirst') }
    if (state === 'AUTO_MISSION') {
      return {
        enabled: false,
        reason: i18n.t(legConfig ? 'command.policy.missionBeforeLegConfig' : 'command.policy.missionBeforePosture'),
      }
    }
    if (state === 'RETURNING' || state === 'DOCKING') {
      const returning = state === 'RETURNING'
      return {
        enabled: false,
        reason: i18n.t(legConfig
          ? (returning ? 'command.policy.returningLegConfig' : 'command.policy.dockingLegConfig')
          : (returning ? 'command.policy.returningPosture' : 'command.policy.dockingPosture')),
      }
    }
    return { enabled: true }
  }

  if (MOVEMENT_COMMANDS.includes(type) && position.freshness === 'missing') {
    return { enabled: false, reason: i18n.t('command.policy.positionUnknown') }
  }

  switch (state) {
    case 'PASSIVE':
      if (MOVEMENT_COMMANDS.includes(type)) {
        return { enabled: false, reason: i18n.t('command.policy.passiveNoMission') }
      }
      return { enabled: true }

    case 'STAND':
      if (type === 'PAUSE' || type === 'RESUME') {
        return { enabled: false, reason: i18n.t('command.policy.noMissionToPause') }
      }
      return { enabled: true }

    case 'MANUAL':
    case 'ASSISTED':
      return { enabled: true }

    case 'AUTO_MISSION':
      if (type === 'RESUME') return { enabled: false, reason: i18n.t('command.policy.missionRunning') }
      if (type === 'DOCK') return { enabled: false, reason: i18n.t('command.policy.dockViaReturn') }
      return { enabled: true }

    case 'RETURNING':
    case 'DOCKING':
      if (type === 'PAUSE' || type === 'RESUME' || type === 'DOCK') {
        return { enabled: false, reason: i18n.t(state === 'RETURNING' ? 'command.policy.returningUseReturn' : 'command.policy.dockingUseReturn') }
      }
      return { enabled: true }

    default:
      return { enabled: true }
  }
}

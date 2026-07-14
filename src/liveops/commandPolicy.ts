import type { CommandAvailability, CommandType, RobotState } from '@/types'

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

export function getCommandAvailability(robot: RobotState, type: CommandType): CommandAvailability {
  const { connectivity, abstract_state: state, position } = robot

  if (connectivity.grpc !== 'connected') {
    return { enabled: false, reason: 'SDK connection lost — commands unavailable' }
  }
  if (connectivity.bridge_state !== 'connected') {
    return { enabled: false, reason: 'Edge bridge offline' }
  }

  if (type === 'ESTOP') {
    if (state === 'E_STOP') return { enabled: false, reason: 'Already in E-Stop' }
    return { enabled: true }
  }

  // Recoverable toggle (docs/01-prd.md §16.2: E_STOP -> STAND, "Authorized
  // reset (Operator+ with confirmation)") — the one command available while
  // E_STOP is active, checked before the blanket block below.
  if (type === 'RESET_ESTOP') {
    if (state !== 'E_STOP') return { enabled: false, reason: 'Not in E-Stop' }
    return { enabled: true }
  }

  if (state === 'E_STOP') {
    return { enabled: false, reason: 'E-Stop active — all commands blocked' }
  }
  if (state === 'FAULT') {
    return { enabled: false, reason: 'Robot in FAULT — recovery required in Fleet workspace' }
  }

  const inManualControl = state === 'MANUAL' || state === 'ASSISTED'

  // Teleoperation control-ownership commands (docs/01-prd.md §16.2, §16.4) —
  // checked as their own group, before the per-state switch below, since
  // MANUAL/ASSISTED's generic "full command set" branch would otherwise wrongly
  // allow TAKE_CONTROL while already active, and PASSIVE/STAND/AUTO_MISSION/
  // RETURNING/DOCKING would wrongly allow driving/gait when not in either.
  if (type === 'TAKE_CONTROL') {
    if (inManualControl) return { enabled: false, reason: 'Already under manual control' }
    if (state === 'AUTO_MISSION') {
      return { enabled: false, reason: 'Pause or cancel the active mission before taking manual control' }
    }
    if (state !== 'STAND') return { enabled: false, reason: 'Robot must be Standing to take manual control' }
    return { enabled: true }
  }
  if (type === 'RELEASE_CONTROL') {
    if (!inManualControl) return { enabled: false, reason: 'Not under manual control' }
    return { enabled: true }
  }
  if (type === 'DRIVE' || type === 'SET_GAIT' || type === 'SET_OBSTACLE_AVOIDANCE') {
    if (!inManualControl) return { enabled: false, reason: 'Only available under manual control' }
    return { enabled: true }
  }

  if (MOVEMENT_COMMANDS.includes(type) && position.freshness === 'missing') {
    return { enabled: false, reason: 'Position unknown — dead-reckoning has no fix' }
  }

  switch (state) {
    case 'PASSIVE':
      if (MOVEMENT_COMMANDS.includes(type)) {
        return { enabled: false, reason: 'Robot is passive — no active mission to control' }
      }
      return { enabled: true }

    case 'STAND':
      if (type === 'PAUSE' || type === 'RESUME') {
        return { enabled: false, reason: 'No active mission to pause or resume' }
      }
      return { enabled: true }

    case 'MANUAL':
    case 'ASSISTED':
      return { enabled: true }

    case 'AUTO_MISSION':
      if (type === 'RESUME') return { enabled: false, reason: 'Mission already running' }
      if (type === 'DOCK') return { enabled: false, reason: 'Dock only reachable via Return' }
      return { enabled: true }

    case 'RETURNING':
    case 'DOCKING':
      if (type === 'PAUSE' || type === 'RESUME' || type === 'DOCK') {
        return { enabled: false, reason: `Robot is ${state === 'RETURNING' ? 'returning to dock' : 'docking'} — use Return to cancel` }
      }
      return { enabled: true }

    default:
      return { enabled: true }
  }
}

import { describe, expect, it } from 'vitest'
import { getCommandAvailability } from './commandPolicy'
import { initialRobots } from '@/mocks/mockRobots'
import type { CommandType, RobotState } from '@/types'
import type { RobotRunView } from './robotRun'

function makeRobot(overrides: Partial<RobotState> = {}): RobotState {
  return { ...initialRobots[1], ...overrides }
}

/** Everything an operator needs to get a de-energised robot moving again. */
const RECOVERY_COMMANDS: CommandType[] = ['SET_STATE', 'TAKE_CONTROL', 'ESTOP', 'SET_OBSTACLE_AVOIDANCE']

describe('PASSIVE does not lock the operator out', () => {
  // Regression guard. `passive` (被动模式, motors de-energised) had no mapping
  // in state_machine.compute_abstract_state and fell through to FAULT, whose
  // branch used to disable every command unconditionally (it no longer does --
  // see FAULT_ALLOWED in commandPolicy.ts). So putting the robot into passive
  // mode -- or reaching it via E-Stop, or via the idle power-down -- used to
  // brick the whole control surface.
  it.each(RECOVERY_COMMANDS)('allows %s from PASSIVE', (type) => {
    const robot = makeRobot({ abstract_state: 'PASSIVE', sdk_state: 'passive' })
    expect(getCommandAvailability(robot, type).enabled).toBe(true)
  })

  it('allows Stand from PASSIVE on a wheel robot', () => {
    const robot = makeRobot({
      abstract_state: 'PASSIVE', sdk_state: 'passive', robot_type: 'wheel',
    })
    expect(getCommandAvailability(robot, 'SET_STATE').enabled).toBe(true)
  })

  it.each(['passive', 'ready', 'stand_down'])(
    'treats sdk_state %s as a recoverable PASSIVE, not a fault',
    (sdk_state) => {
      const robot = makeRobot({ abstract_state: 'PASSIVE', sdk_state })
      expect(getCommandAvailability(robot, 'SET_STATE').enabled).toBe(true)
      expect(getCommandAvailability(robot, 'TAKE_CONTROL').enabled).toBe(true)
    },
  )

  it('still blocks mission controls in PASSIVE, since no mission is running', () => {
    const robot = makeRobot({ abstract_state: 'PASSIVE', sdk_state: 'passive' })
    for (const type of ['PAUSE', 'RESUME', 'RETURN', 'DOCK'] as CommandType[]) {
      expect(getCommandAvailability(robot, type).enabled).toBe(false)
    }
  })

  it('still requires manual control before driving', () => {
    const robot = makeRobot({ abstract_state: 'PASSIVE', sdk_state: 'passive' })
    expect(getCommandAvailability(robot, 'DRIVE').enabled).toBe(false)
  })
})

describe('wheel robots and quad-only commands', () => {
  it.each(['BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE'])(
    'disables %s on a wheel robot with a reason',
    (type) => {
      const robot = makeRobot({ robot_type: 'wheel', abstract_state: 'STAND' })
      const result = getCommandAvailability(robot, type as CommandType)
      expect(result.enabled).toBe(false)
      expect(result.reason).toMatch(/not supported/i)
    },
  )

  it('allows balance commands on a quad robot', () => {
    const robot = makeRobot({ robot_type: 'quad', abstract_state: 'STAND' })
    expect(getCommandAvailability(robot, 'BALANCE_AXIS').enabled).toBe(true)
  })

  it('never gates E-Stop on robot type', () => {
    const robot = makeRobot({ robot_type: 'wheel', abstract_state: 'MANUAL' })
    expect(getCommandAvailability(robot, 'ESTOP').enabled).toBe(true)
  })

  it('never gates ordinary motion commands on a wheel robot', () => {
    const robot = makeRobot({ robot_type: 'wheel', abstract_state: 'MANUAL' })
    for (const type of ['SET_STATE', 'DRIVE', 'SET_GAIT'] as CommandType[]) {
      expect(getCommandAvailability(robot, type).enabled).toBe(true)
    }
  })
})

describe('E-Stop remains recoverable', () => {
  it('blocks ordinary commands but allows RESET_ESTOP', () => {
    const robot = makeRobot({ abstract_state: 'E_STOP', sdk_state: 'passive' })
    expect(getCommandAvailability(robot, 'SET_STATE').enabled).toBe(false)
    expect(getCommandAvailability(robot, 'RESET_ESTOP').enabled).toBe(true)
  })
})

describe('E-Stop availability under link degradation', () => {
  // gRPC health now degrades on stale telemetry (3s), where it previously
  // almost never left 'connected' due to a mapping bug. E-Stop must not sit
  // behind that gate: safety_manager approves ESTOP unconditionally, so the
  // bridge always attempts it, and a failed ACK beats a UI that won't let the
  // operator try.
  it.each(['degraded', 'unavailable'] as const)(
    'stays enabled when the SDK link is %s',
    (grpc) => {
      const robot = makeRobot({
        abstract_state: 'MANUAL',
        connectivity: { ...initialRobots[1].connectivity, grpc },
      })
      expect(getCommandAvailability(robot, 'ESTOP').enabled).toBe(true)
    },
  )

  it('is disabled when the edge bridge itself is offline', () => {
    // Nothing can be attempted: the command cannot reach the bridge.
    const robot = makeRobot({
      connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' },
    })
    const result = getCommandAvailability(robot, 'ESTOP')
    expect(result.enabled).toBe(false)
    expect(result.reason).toMatch(/bridge offline/i)
  })

  it('still blocks ordinary commands when the SDK link is down', () => {
    const robot = makeRobot({
      abstract_state: 'STAND',
      connectivity: { ...initialRobots[1].connectivity, grpc: 'unavailable' },
    })
    const result = getCommandAvailability(robot, 'SET_STATE')
    expect(result.enabled).toBe(false)
    expect(result.reason).toMatch(/SDK connection lost/i)
  })

  it('is disabled only because E-Stop is already active, not for link reasons', () => {
    const robot = makeRobot({
      abstract_state: 'E_STOP',
      connectivity: { ...initialRobots[1].connectivity, grpc: 'unavailable' },
    })
    expect(getCommandAvailability(robot, 'ESTOP').reason).toMatch(/already in e-stop/i)
  })
})


// --- STOP_SPEAK ------------------------------------------------------------
//
// Silencing the robot must never be refused. It travels over DDS rather than
// gRPC, and safety_manager approves it unconditionally, so the UI must not gate
// it on robot state -- least of all during a fault, when a blaring announcement
// is most unwelcome.

describe('STOP_SPEAK', () => {
  it.each(['PASSIVE', 'STAND', 'MANUAL', 'ASSISTED', 'AUTO_MISSION', 'RETURNING', 'DOCKING', 'FAULT', 'E_STOP'] as const)(
    'is enabled in %s',
    (state) => {
      expect(getCommandAvailability(makeRobot({ abstract_state: state }), 'STOP_SPEAK').enabled).toBe(true)
    },
  )

  it('is enabled even when the gRPC link is down', () => {
    // Audio goes over DDS; a dead gRPC link says nothing about it.
    const r = makeRobot({ connectivity: { ...makeRobot().connectivity, grpc: 'unavailable' } })
    expect(getCommandAvailability(r, 'STOP_SPEAK').enabled).toBe(true)
  })

  it('is enabled with no position fix', () => {
    const r = makeRobot({ position: { ...makeRobot().position, freshness: 'missing' } })
    expect(getCommandAvailability(r, 'STOP_SPEAK').enabled).toBe(true)
  })

  it('is disabled only when the bridge itself is unreachable', () => {
    // Nothing can be delivered at all in that case, so claiming otherwise
    // would be a lie rather than caution.
    const r = makeRobot({ connectivity: { ...makeRobot().connectivity, bridge_state: 'offline' } })
    expect(getCommandAvailability(r, 'STOP_SPEAK').enabled).toBe(false)
  })
})

describe('FAULT is restricted, not sealed', () => {
  const faulted = makeRobot({ abstract_state: 'FAULT' })

  it('allows E-Stop', () => {
    expect(getCommandAvailability(faulted, 'ESTOP').enabled).toBe(true)
  })

  it('allows SET_STATE so the operator can reach a defined posture', () => {
    expect(getCommandAvailability(faulted, 'SET_STATE').enabled).toBe(true)
  })

  it('still blocks ordinary motion', () => {
    const drive = getCommandAvailability(faulted, 'DRIVE')
    expect(drive.enabled).toBe(false)
    expect(drive.reason).toContain('FAULT')
  })

  it('no longer points the operator at a Fleet affordance that does not exist', () => {
    expect(getCommandAvailability(faulted, 'DRIVE').reason).not.toContain('Fleet')
  })
})

describe('CHANGE_MODE is held to the same mission guards as SET_STATE', () => {
  // It matched no branch at all, so it fell through the per-state switch and
  // came back enabled in exactly the three states SET_STATE is blocked in.
  // Switching leg configuration (parallel <-> X-shape) mid-patrol is strictly
  // more disruptive than the posture change that guard was written for.
  it.each(['AUTO_MISSION', 'RETURNING', 'DOCKING'] as const)(
    'blocks CHANGE_MODE in %s, as it blocks SET_STATE',
    (abstract_state) => {
      const robot = makeRobot({ abstract_state })
      expect(getCommandAvailability(robot, 'SET_STATE').enabled).toBe(false)
      const result = getCommandAvailability(robot, 'CHANGE_MODE')
      expect(result.enabled).toBe(false)
      expect(result.reason).toBeTruthy()
    },
  )

  it('explains the block in terms of leg configuration, not posture', () => {
    const robot = makeRobot({ abstract_state: 'AUTO_MISSION' })
    expect(getCommandAvailability(robot, 'CHANGE_MODE').reason).toMatch(/leg configuration/i)
  })

  it.each(['PASSIVE', 'STAND', 'MANUAL', 'ASSISTED'] as const)(
    'still allows CHANGE_MODE in %s',
    (abstract_state) => {
      expect(getCommandAvailability(makeRobot({ abstract_state }), 'CHANGE_MODE').enabled).toBe(true)
    },
  )

  it('is still blocked in FAULT -- it is not in FAULT_ALLOWED', () => {
    expect(getCommandAvailability(makeRobot({ abstract_state: 'FAULT' }), 'CHANGE_MODE').enabled)
      .toBe(false)
  })
})

describe('an edge mission run', () => {
  const runView = (over: Partial<NonNullable<RobotRunView>> = {}): NonNullable<RobotRunView> => ({
    phase: 'running', runId: 'r1', missionName: 'Patrol', stepLabel: 'Walk 2 m', blockId: 'b1',
    redoStepLabel: null, startedAt: '2026-10-30T01:00:00Z', owner: 'mission:r1', youHoldControl: false,
    estimateS: null, ...over,
  })
  // The bridge reports AUTO_MISSION for the whole run, in any posture -- lying
  // down included -- so nothing here may assume AUTO_MISSION means standing.
  const running = makeRobot({ abstract_state: 'AUTO_MISSION', sdk_state: 'ready', control_owner: 'mission:r1' })

  it('test_take_control_allowed_while_edge_run_running', () => {
    expect(getCommandAvailability(running, 'TAKE_CONTROL', runView()).enabled).toBe(true)
    const walking = makeRobot({ abstract_state: 'AUTO_MISSION', sdk_state: 'walk', control_owner: 'mission:r1' })
    expect(getCommandAvailability(walking, 'TAKE_CONTROL', runView()).enabled).toBe(true)
  })

  it('test_take_control_allowed_when_paused_and_nobody_holds_control', () => {
    const idle = makeRobot({ abstract_state: 'STAND', sdk_state: 'balance_stand', control_owner: null })
    expect(getCommandAvailability(idle, 'TAKE_CONTROL', runView({ phase: 'paused', owner: null })).enabled).toBe(true)
  })

  it('test_take_control_allowed_when_paused_nobody_in_control_and_state_reads_manual', () => {
    // A wheel robot standing upright reads MANUAL; that must not hide Take control here.
    const upright = makeRobot({ robot_type: 'wheel', abstract_state: 'MANUAL', sdk_state: 'wheel_loco', control_owner: null })
    expect(getCommandAvailability(upright, 'TAKE_CONTROL', runView({ phase: 'paused', owner: null })).enabled).toBe(true)
  })

  it('test_take_control_still_blocked_in_auto_mission_without_run_view', () => {
    const r = getCommandAvailability(running, 'TAKE_CONTROL')
    expect(r.enabled).toBe(false)
    expect(r.reason).toBe('Pause or cancel the active mission before taking manual control')
  })

  it('test_posture_disabled_while_running_with_reason', () => {
    for (const type of ['SET_STATE', 'CHANGE_MODE'] as CommandType[]) {
      const r = getCommandAvailability(running, type, runView())
      expect(r.enabled).toBe(false)
      expect(r.reason).toBe('A mission is running. Take control first.')
    }
  })

  it('test_release_disabled_while_running', () => {
    expect(getCommandAvailability(running, 'RELEASE_CONTROL', runView()).enabled).toBe(false)
  })

  it('test_lights_speak_avoidance_enabled_while_running', () => {
    for (const type of ['LED_SIGNAL', 'SPEAK', 'STOP_SPEAK', 'SET_SPEAK_VOLUME', 'SET_OBSTACLE_AVOIDANCE'] as CommandType[]) {
      expect(getCommandAvailability(running, type, runView()).enabled, type).toBe(true)
    }
  })

  it('test_stop_mission_enabled_running_or_paused', () => {
    expect(getCommandAvailability(running, 'STOP_MISSION', runView()).enabled).toBe(true)
    const paused = makeRobot({ abstract_state: 'MANUAL', control_owner: 'operator-dev' })
    expect(getCommandAvailability(paused, 'STOP_MISSION', runView({ phase: 'paused', owner: 'operator-dev', youHoldControl: true })).enabled).toBe(true)
    expect(getCommandAvailability(paused, 'STOP_MISSION').enabled).toBe(false)
    expect(getCommandAvailability(paused, 'STOP_MISSION', runView({ phase: 'ended' })).enabled).toBe(false)
  })

  it('leaves E-Stop available during a run', () => {
    expect(getCommandAvailability(running, 'ESTOP', runView()).enabled).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { getCommandAvailability } from './commandPolicy'
import { initialRobots } from '@/mocks/mockRobots'
import type { CommandType, RobotState } from '@/types'

function makeRobot(overrides: Partial<RobotState> = {}): RobotState {
  return { ...initialRobots[1], ...overrides }
}

/** Everything an operator needs to get a de-energised robot moving again. */
const RECOVERY_COMMANDS: CommandType[] = ['SET_STATE', 'TAKE_CONTROL', 'ESTOP', 'SET_OBSTACLE_AVOIDANCE']

describe('PASSIVE does not lock the operator out', () => {
  // Regression guard. `passive` (被动模式, motors de-energised) had no mapping
  // in state_machine.compute_abstract_state and fell through to FAULT, and the
  // FAULT branch below disables every command with "recovery required in Fleet
  // workspace". So putting the robot into passive mode -- or reaching it via
  // E-Stop, or via the idle power-down -- bricked the whole control surface.
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

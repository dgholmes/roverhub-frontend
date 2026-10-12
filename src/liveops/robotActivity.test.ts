import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { Mission, RobotState } from '@/types'
import { robotActivity } from './robotActivity'

const base: RobotState = { ...initialRobots[1], abstract_state: 'STAND', posture: 'upright', control_owner: null }

function robot(over: Partial<RobotState> = {}): RobotState {
  return { ...base, ...over, connectivity: { ...base.connectivity, ...(over.connectivity ?? {}) } }
}

const mission = {
  name: 'Perimeter Patrol', current_waypoint_index: 3,
  waypoints: Array.from({ length: 8 }, () => ({})),
} as unknown as Mission

describe('robotActivity', () => {
  it('names the state when the robot is simply standing', () => {
    expect(robotActivity(robot())).toEqual({ text: 'Standing', tone: 'state' })
  })

  it('shows mission progress while on a mission', () => {
    expect(robotActivity(robot({ abstract_state: 'AUTO_MISSION' }), mission))
      .toEqual({ text: '4/8 · Perimeter Patrol', tone: 'state' })
  })

  it('names who is driving under manual control', () => {
    expect(robotActivity(robot({ abstract_state: 'MANUAL', control_owner: 'M. Joo' })).text).toBe('Driven by M. Joo')
  })

  it('puts a fall ahead of the ordinary state', () => {
    expect(robotActivity(robot({ abstract_state: 'MANUAL', posture: 'fallen' })))
      .toEqual({ text: 'Fallen', tone: 'critical' })
  })

  it('puts E-Stop ahead of everything but connectivity', () => {
    expect(robotActivity(robot({ abstract_state: 'E_STOP', posture: 'fallen' })).tone).toBe('critical')
    expect(robotActivity(robot({ abstract_state: 'E_STOP' })).text).toBe('Emergency stop engaged')
  })

  it('never presents a last-known state as live when the robot is unreachable', () => {
    const r = robot({ abstract_state: 'E_STOP', connectivity: { ...base.connectivity, grpc: 'unavailable' } })
    expect(robotActivity(r)).toEqual({ text: 'Unreachable', tone: 'warn' })
  })

  it('distinguishes a dead bridge from a switched-off robot', () => {
    const r = robot({ connectivity: { ...base.connectivity, bridge_state: 'offline' } })
    expect(robotActivity(r).text).toBe('Bridge offline')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

const stub = vi.hoisted(() => ({ drives: [] as number[][] }))

vi.mock('@/lib/realtime/dataProvider', () => ({
  USE_REAL_BACKEND: false,
  dataProvider: {
    getRobots: () => [],
    driveRobot: (_robotId: string, vx: number, vy: number, vyaw: number) => stub.drives.push([vx, vy, vyaw]),
  },
}))

import { useLiveOpsStore } from './useLiveOpsStore'

const robot = (overrides: Partial<RobotState>): RobotState =>
  ({ ...initialRobots[1], robot_id: 'r1', ...overrides })

beforeEach(() => {
  stub.drives = []
})

describe('driveRobot', () => {
  // The drive loop records a setpoint as sent only when this returns true. It
  // used to return nothing, so a move dropped by the policy gate counted as
  // sent and was not retried until the next keepalive -- itself droppable.
  it('reports a move it refuses, and sends nothing', () => {
    useLiveOpsStore.setState({ robots: [robot({ abstract_state: 'PASSIVE', sdk_state: 'ready', control_owner: null })] })
    expect(useLiveOpsStore.getState().driveRobot('r1', 0.6, 0, 0)).toBe(false)
    expect(stub.drives).toEqual([])
  })

  it('always sends a stop, whatever the state', () => {
    useLiveOpsStore.setState({ robots: [robot({ abstract_state: 'PASSIVE', sdk_state: 'ready', control_owner: null })] })
    expect(useLiveOpsStore.getState().driveRobot('r1', 0, 0, 0)).toBe(true)
    expect(stub.drives).toEqual([[0, 0, 0]])
  })

  it('sends a move while control is held, even standing between moves', () => {
    useLiveOpsStore.setState({ robots: [robot({ abstract_state: 'STAND', sdk_state: 'balance_stand', control_owner: 'operator-dev' })] })
    expect(useLiveOpsStore.getState().driveRobot('r1', 0.6, 0, 0)).toBe(true)
    expect(stub.drives).toEqual([[0.6, 0, 0]])
  })
})

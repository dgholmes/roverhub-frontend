import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import { LOOK_NEUTRAL } from '@/components/liveops/hero/lookAround'
import type { RobotState } from '@/types'

vi.mock('@/lib/realtime/dataProvider', () => ({
  USE_REAL_BACKEND: false,
  dataProvider: { getRobots: () => [] },
}))

import { useLiveOpsStore } from './useLiveOpsStore'

const robot = (overrides: Partial<RobotState>): RobotState =>
  ({ ...initialRobots[1], robot_id: 'r1', robot_type: 'quad', ...overrides })
const held = { abstract_state: 'STAND', sdk_state: 'balance_stand', control_owner: 'operator-dev' } as const
const target = { pitchDeg: -4, yawDeg: 6 }

beforeEach(() => useLiveOpsStore.setState({ lookTargets: {} }))

describe('lookRobot (stub until the LOOK command exists)', () => {
  it('accepts a look while control is held and records the newest target', () => {
    useLiveOpsStore.setState({ robots: [robot(held)] })
    expect(useLiveOpsStore.getState().lookRobot('r1', target)).toBe(true)
    expect(useLiveOpsStore.getState().lookTargets.r1).toEqual(target)
  })

  it('refuses a look when nobody holds control, and records nothing', () => {
    useLiveOpsStore.setState({ robots: [robot({ ...held, control_owner: null })] })
    expect(useLiveOpsStore.getState().lookRobot('r1', target)).toBe(false)
    expect(useLiveOpsStore.getState().lookTargets.r1).toBeUndefined()
  })

  it('refuses a look on a wheel robot, which has no balance moves', () => {
    useLiveOpsStore.setState({ robots: [robot({ ...held, robot_type: 'wheel' })] })
    expect(useLiveOpsStore.getState().lookRobot('r1', target)).toBe(false)
  })

  it('refuses a look in E-Stop', () => {
    useLiveOpsStore.setState({ robots: [robot({ ...held, abstract_state: 'E_STOP', sdk_state: 'passive' })] })
    expect(useLiveOpsStore.getState().lookRobot('r1', target)).toBe(false)
  })

  it('never refuses the return to neutral', () => {
    useLiveOpsStore.setState({ robots: [robot({ ...held, control_owner: null })] })
    expect(useLiveOpsStore.getState().lookRobot('r1', LOOK_NEUTRAL)).toBe(true)
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import { turnBlock, turnGate } from './turnGate'

const ME = 'operator-dev'
// A standing robot under this operator's control.
const robot = (over: Partial<RobotState> = {}): RobotState =>
  ({ ...initialRobots[1], abstract_state: 'STAND', sdk_state: 'balance_stand', posture: 'upright', control_owner: ME, active_run: null, nav_goal: null, ...over })
const status = (over: Partial<Pick<LidarMountStatus, 'mode' | 'measured'>> = {}): Pick<LidarMountStatus, 'mode' | 'measured'> => ({
  mode: 'suggest',
  measured: {
    x_m: null, y_m: null, sd_x_m: null, sd_y_m: null, roll_deg: 0, pitch_deg: 19.4, sd_tilt_deg: 0.1,
    turns: 0, still_samples: 1, since: null, updated_at: null, offset_confident: false,
  },
  ...over,
})

beforeAll(async () => { await i18n.changeLanguage('en') })

describe('turnGate', () => {
  it('opens for a standing robot under my control, in MANUAL too', () => {
    expect(turnGate(robot(), status(), ME)).toEqual({ ok: true })
    expect(turnGate(robot({ abstract_state: 'MANUAL', sdk_state: 'walk' }), status(), ME)).toEqual({ ok: true })
  })

  it('gives the one reason it is closed, in order', () => {
    const offline = robot({ connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } })
    expect(turnGate(offline, status(), ME)).toMatchObject({ reason: 'offline' })
    expect(turnGate(robot(), status({ mode: 'off' }), ME)).toMatchObject({ reason: 'off' })
    expect(turnGate(robot(), status({ measured: { ...status().measured!, x_m: 0.2, y_m: 0, offset_confident: true } }), ME)).toMatchObject({ reason: 'done' })
    expect(turnGate(robot({ control_owner: 'mission:run-1' }), status(), ME)).toMatchObject({ reason: 'mission' })
    expect(turnGate(robot({ control_owner: 'nav:goal-1' }), status(), ME)).toMatchObject({ reason: 'nav' })
    expect(turnGate(robot({ control_owner: 'eng-2' }), status(), ME)).toMatchObject({ reason: 'otherHasControl' })
    expect(turnGate(robot({ abstract_state: 'PASSIVE', sdk_state: 'ready' }), status(), ME)).toMatchObject({ reason: 'notStanding' })
    expect(turnGate(robot({ posture: 'fallen' }), status(), ME)).toMatchObject({ reason: 'notStanding' })
  })

  it('offers Take control when nobody holds it', () => {
    expect(turnGate(robot({ control_owner: null }), status(), ME)).toEqual({ ok: false, reason: 'takeControl', canTake: true })
  })

  it('passes on the command policy\'s own refusal of ROTATE', () => {
    const gate = turnGate(robot({ battery: { ...initialRobots[1].battery, percent: 3 } }), status(), ME)
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('policy')
  })
})

describe('turnBlock', () => {
  it('ends a run when the robot is gone, control moved or it stopped standing', () => {
    expect(turnBlock(robot(), ME)).toBeNull()
    expect(turnBlock(null, ME)).toBe('offline')
    expect(turnBlock(robot({ control_owner: 'eng-2' }), ME)).toBe('lostControl')
    expect(turnBlock(robot({ abstract_state: 'E_STOP' }), ME)).toBe('notStanding')
  })
})

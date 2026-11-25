import { afterEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_USER } from '@/lib/auth/types'
import { seedUserNamesForTests, setUserNamesFetcherForTests } from '@/lib/auth/useUserNames'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { Mission, RobotState } from '@/types'
import { controlOwnerText, robotActivity } from './robotActivity'

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

describe('controlOwnerText', () => {
  it('says "you" when you hold control, not your user id', () => {
    expect(controlOwnerText('operator-dev', 'operator-dev')).toBe('Driven by you')
  })

  it('names anyone else by what the robot reports', () => {
    expect(controlOwnerText('u-kim', 'operator-dev')).toBe('Driven by u-kim')
  })
})

describe('a robot walking to a tapped goal', () => {
  // The bridge reports a walk as MANUAL with control_owner `nav:<goal_id>`.
  // That id means nothing to a reader; what the robot is doing does.
  it('says it is walking to a goal, never the raw nav owner', () => {
    const a = robotActivity(robot({ abstract_state: 'MANUAL', control_owner: 'nav:5d1e-77' }))
    expect(a.text).toBe('Walking to a goal')
    expect(a.text).not.toContain('nav:')
  })

  it('words the nav owner the same way in controlOwnerText, in both languages', () => {
    expect(controlOwnerText('nav:5d1e-77', 'operator-dev')).toBe('Walking to a goal')
    const ko = i18n.getFixedT('ko')
    expect(i18n.t('liveops.activity.walkingToGoal', { lng: 'ko' })).toBe(ko('liveops.activity.walkingToGoal'))
    expect(ko('liveops.activity.walkingToGoal')).not.toBe('Walking to a goal')
  })
})

// Signed in, with the backend's names for two people already asked.
const signInWithNames = () => {
  setUserNamesFetcherForTests(async () => ({}))
  useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: { ...DEV_USER, user_id: 'u-me', display_name: 'Jin' }, token: 't1', expiresAt: null, notice: null })
  seedUserNamesForTests({ 'u-ana': 'Ana', 'u-kim': 'Kim' })
}
const signOutNames = () => {
  setUserNamesFetcherForTests(null)
  useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
}

describe('controlOwnerText with names', () => {
  afterEach(signOutNames)

  it('names the driver, not their user id', () => {
    signInWithNames()
    expect(controlOwnerText('u-kim', 'u-me')).toBe('Driven by Kim')
    expect(robotActivity(robot({ abstract_state: 'MANUAL', control_owner: 'u-ana' })).text).toBe('Driven by Ana')
  })
})

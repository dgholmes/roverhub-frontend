import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_USER } from '@/lib/auth/types'
import { seedUserNamesForTests, setUserNamesFetcherForTests } from '@/lib/auth/useUserNames'
import i18n from '@/i18n'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { moveSiteBlockText, setRobotSite } from './robotSite'

let dispatch: ReturnType<typeof vi.fn>
let outcome: CommandOutcome

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  outcome = {
    result: 'completed',
    command: {
      command_id: 'c1', robot_id: 'rover-pi', type: 'SET_SITE', label: '', stages: [], current_stage: 'execution_completed',
      initiated_by: 'x', result: { restarting: true },
    } as never,
  }
  dispatch = vi.fn(async () => outcome)
  useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
})

describe('setRobotSite (SET_SITE, 0.0.29)', () => {
  it('sends SET_SITE with the new site', async () => {
    expect(await setRobotSite('rover-pi', 'site-b')).toEqual({ ok: true, error: null })
    const [robotId, type, label, params] = dispatch.mock.calls[0]
    expect([robotId, type, params]).toEqual(['rover-pi', 'SET_SITE', { site_id: 'site-b' }])
    expect(label).toContain('site-b')
  })

  it('refuses a site id that cannot be a topic level, without sending anything', async () => {
    for (const bad of ['', 'site/b', 'site+b', 'site#', 'site b', 'x'.repeat(65)]) {
      const out = await setRobotSite('rover-pi', bad)
      expect(out.ok, bad).toBe(false)
      expect(out.error, bad).toBeTruthy()
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('a lost answer is not a refusal: it says so, as noAnswer', async () => {
    outcome = { ...outcome, result: 'unknown' }
    const out = await setRobotSite('rover-pi', 'site-b')
    expect(out).toMatchObject({ ok: false, noAnswer: true })
  })

  it('puts a refusal into words', async () => {
    outcome = { ...outcome, result: 'failed' }
    outcome.command.failure_reason = 'REJECTED_NAV_GOAL_ACTIVE: the robot is walking to a point'
    const out = await setRobotSite('rover-pi', 'site-b')
    expect(out.ok).toBe(false)
    expect(out.error).not.toMatch(/REJECTED_/)
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

describe('moveSiteBlockText', () => {
  afterEach(signOutNames)

  it('names who holds the robot, and says so when it is you', () => {
    signInWithNames()
    expect(moveSiteBlockText('control', { control_owner: 'u-ana' }))
      .toBe('Ana has control of the robot. It must be released first: moving restarts the robot’s bridge.')
    expect(moveSiteBlockText('control', { control_owner: 'u-me' }))
      .toBe('You have control of the robot. Release control first: moving restarts the robot’s bridge.')
    expect(moveSiteBlockText('estop', { control_owner: null })).toBe('The robot is in E-Stop.')
  })
})

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_USER, type AuthUser } from '@/lib/auth/types'
import { seedUserNamesForTests, setUserNamesFetcherForTests, userNameOf } from '@/lib/auth/useUserNames'
import { DEV_OPERATOR_ID as OPERATOR_ID } from '@/lib/realtime/operator'
import { controlHolderName, isMissionOwner, isNavOwner, isPersonOwner, operatorHoldsControl } from './controlOwner'

describe('operatorHoldsControl', () => {
  it('test_true_only_for_this_operator', () => {
    expect(operatorHoldsControl({ control_owner: OPERATOR_ID })).toBe(true)
  })

  it('test_false_for_a_mission_owner', () => {
    // A running mission holds control as mission:<run_id>. The drive overlay and
    // its 60 s deadman must never mount for it: the deadman's RELEASE_CONTROL
    // would be refused, and the drive pad would fight the program.
    expect(operatorHoldsControl({ control_owner: 'mission:r1' })).toBe(false)
  })

  it('test_false_for_nobody_and_for_another_operator', () => {
    expect(operatorHoldsControl({ control_owner: null })).toBe(false)
    expect(operatorHoldsControl({ control_owner: 'operator-b' })).toBe(false)
    expect(operatorHoldsControl(undefined)).toBe(false)
  })
})

describe('isMissionOwner', () => {
  it('recognises mission owners only', () => {
    expect(isMissionOwner('mission:r1')).toBe(true)
    expect(isMissionOwner(OPERATOR_ID)).toBe(false)
    expect(isMissionOwner(null)).toBe(false)
  })
})

describe('isNavOwner', () => {
  it('recognises a nav goal holding control, and nothing else', () => {
    expect(isNavOwner('nav:8f2c')).toBe(true)
    expect(isNavOwner('mission:r1')).toBe(false)
    expect(isNavOwner(OPERATOR_ID)).toBe(false)
    expect(isNavOwner(null)).toBe(false)
    expect(isNavOwner(undefined)).toBe(false)
  })

  it('never reads a nav goal as this operator holding control', () => {
    expect(operatorHoldsControl({ control_owner: 'nav:8f2c' })).toBe(false)
  })
})

const JIN = { user_id: 'u-me', username: 'jin', display_name: 'Jin', org_role: 'member', site_roles: {}, audit_access: false, disabled: false } as unknown as AuthUser
const signIn = (fetcher: (ids: readonly string[]) => Promise<Record<string, string>> = async () => ({})) => {
  setUserNamesFetcherForTests(fetcher)
  useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: JIN, token: 't1', expiresAt: null, notice: null })
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('controlHolderName', () => {
  beforeAll(async () => { await i18n.changeLanguage('en') })
  afterEach(() => {
    setUserNamesFetcherForTests(null)
    useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
  })

  it('names a person, not their user id', () => {
    signIn()
    seedUserNamesForTests({ 'u-56306e3a014d': 'Ana' })
    expect(controlHolderName('u-56306e3a014d')).toBe('Ana')
  })

  it('falls back to the id for someone the backend does not know', () => {
    signIn()
    expect(controlHolderName('u-gone')).toBe('u-gone')
  })

  it('says you for this operator, and your own name where a field wants one', () => {
    signIn()
    expect(controlHolderName('u-me')).toBe('you')
    expect(controlHolderName('u-me', null)).toBe('Jin')
    // Sign-in off: the dev user is still you.
    useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null })
    expect(controlHolderName(OPERATOR_ID)).toBe('you')
    expect(controlHolderName(OPERATOR_ID, null)).toBe('Developer')
  })

  it('reads a mission and a walk as what holds the robot', () => {
    expect(controlHolderName('mission:r1')).toBe('a mission')
    expect(controlHolderName('nav:8f2c')).toBe('a walk to a goal')
  })

  it('asks once for a name it does not know, and uses it when it arrives', async () => {
    const fetcher = vi.fn().mockResolvedValue({ 'u-ana': 'Ana' })
    signIn(fetcher)
    expect(controlHolderName('u-ana')).toBe('u-ana')
    expect(controlHolderName('u-ana')).toBe('u-ana')
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toEqual(['u-ana'])
    expect(controlHolderName('u-ana')).toBe('Ana')
  })

  it('does not ask again after a failed ask: it runs during render, so that would loop', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    signIn(fetcher)
    expect(userNameOf('u-ana')).toBe('u-ana')
    await flush()
    expect(userNameOf('u-ana')).toBe('u-ana')
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('asks nobody with sign-in off', () => {
    const fetcher = vi.fn()
    setUserNamesFetcherForTests(fetcher)
    expect(userNameOf('u-ana')).toBe('u-ana')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('counts only people as people', () => {
    expect(isPersonOwner('u-ana')).toBe(true)
    expect(isPersonOwner('mission:r1')).toBe(false)
    expect(isPersonOwner('nav:8f2c')).toBe(false)
    expect(isPersonOwner(null)).toBe(false)
  })
})

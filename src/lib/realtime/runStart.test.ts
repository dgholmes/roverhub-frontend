import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_USER } from '@/lib/auth/types'
import { seedUserNamesForTests, setUserNamesFetcherForTests } from '@/lib/auth/useUserNames'
import { fetchUserNames } from '@/lib/auth/userNamesApi'
import i18n from '@/i18n'
import { RunStartRefused, runStartError } from './runStart'

vi.mock('@/lib/auth/userNamesApi', () => ({ fetchUserNames: vi.fn() }))
const fetchNames = vi.mocked(fetchUserNames)

const refusal = (detail: string, status = 409) => ({ status, json: async () => ({ detail }) })

// The dispatcher's sentence names the holder by id (runs/dispatch.py); the
// operator asked to be told who, not "someone".
describe('runStartError: who has control', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: { ...DEV_USER, user_id: 'u-me', display_name: 'Jin' }, token: 't1', expiresAt: null, notice: null })
    setUserNamesFetcherForTests(async () => ({}))
    fetchNames.mockReset()
  })
  afterEach(async () => {
    setUserNamesFetcherForTests(null)
    useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
    await i18n.changeLanguage('en')
  })

  it('names a person already known on the page', async () => {
    seedUserNamesForTests({ 'u-ana': 'Ana' })
    const e = await runStartError(refusal('u-ana has control of rover-jetson; release control first'), 'POST')
    expect(e).toBeInstanceOf(RunStartRefused)
    expect(e.message).toBe('Ana has control of the robot; it must be released first')
    expect(fetchNames).not.toHaveBeenCalled()
  })

  it('asks for a name the page does not have yet', async () => {
    fetchNames.mockResolvedValue({ 'u-kim': 'Kim' })
    const e = await runStartError(refusal('u-kim has control of rover-jetson; release control first'), 'POST')
    expect(e.message).toBe('Kim has control of the robot; it must be released first')
    expect(fetchNames).toHaveBeenCalledWith(['u-kim'])
  })

  it('falls back to the id when the ask fails', async () => {
    fetchNames.mockRejectedValue(new Error('offline'))
    const e = await runStartError(refusal('u-kim has control of rover-jetson; release control first'), 'POST')
    expect(e.message).toBe('u-kim has control of the robot; it must be released first')
  })

  it('says "you" when the holder is the signed-in operator', async () => {
    const e = await runStartError(refusal('u-me has control of rover-jetson; release control first'), 'POST')
    expect(e.message).toBe('you have control of the robot; release it first')
  })

  it('says a mission when a mission holds it', async () => {
    const e = await runStartError(refusal('mission:r1 has control of rover-jetson; release control first'), 'POST')
    expect(e.message).toBe('a mission has control of the robot; it must be released first')
  })

  it('in Korean too', async () => {
    seedUserNamesForTests({ 'u-ana': 'Ana' })
    await i18n.changeLanguage('ko')
    const e = await runStartError(refusal('u-ana has control of rover-jetson; release control first'), 'POST')
    expect(e.message).toBe('Ana 제어 중입니다. 먼저 제어권이 해제되어야 합니다')
  })

  it('leaves every other refusal as the backend wrote it', async () => {
    const e = await runStartError(refusal('rover-jetson is offline'), 'POST')
    expect(e.message).toBe('rover-jetson is offline')
  })
})

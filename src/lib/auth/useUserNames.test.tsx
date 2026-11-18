// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { DEV_USER, type AuthUser } from './types'
import { MAX_NAME_IDS, createUserNamesApi } from './userNamesApi'
import { setUserNamesFetcherForTests, useUserNames } from './useUserNames'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

describe('GET /users/names', () => {
  it('asks for the ids, comma-separated, and keeps only string names', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { names: { 'u-1': 'owner', 'u-2': 7 } }))
    expect(await createUserNamesApi('http://a', f)(['u-1', 'u-2', 'a b'])).toEqual({ 'u-1': 'owner' })
    expect(f).toHaveBeenCalledWith('http://a/users/names?ids=u-1,u-2,a%20b')
  })

  it(`asks at most ${MAX_NAME_IDS} ids at a time`, async () => {
    const f = vi.fn().mockResolvedValue(res(200, { names: {} }))
    await createUserNamesApi('http://a', f)(Array.from({ length: 120 }, (_, k) => `u${k}`))
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('throws on a refusal', async () => {
    const f = vi.fn().mockResolvedValue(res(403, { detail: 'no' }))
    await expect(createUserNamesApi('http://a', f)(['u-1'])).rejects.toThrow()
  })
})

const me: AuthUser = {
  user_id: 'u-me', username: 'me', display_name: 'Jin', org_role: 'member', site_roles: { '*': 'engineer' }, audit_access: false, disabled: false,
} as AuthUser

let host: HTMLDivElement
let root: Root
let seen: Record<string, string> = {}
function Probe({ ids }: { ids: (string | null)[] }) {
  seen = { ...useUserNames(ids) }
  return null
}
const show = (ids: (string | null)[]) => act(() => root.render(<Probe ids={ids} />))
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  host = document.createElement('div')
  root = createRoot(host)
  seen = {}
})
afterEach(() => {
  act(() => root.unmount())
  setUserNamesFetcherForTests(null)
  useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
})

describe('useUserNames', () => {
  it('names people once per session, leaves an unknown id as it is, and never asks for my own name', async () => {
    const fetcher = vi.fn().mockResolvedValue({ 'u-56306e3a014d': 'owner' })
    setUserNamesFetcherForTests(fetcher)
    useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: me, token: 't1', expiresAt: null, notice: null })
    show(['u-56306e3a014d', 'u-me', 'u-gone', null, 'u-56306e3a014d'])
    expect(seen).toEqual({ 'u-56306e3a014d': 'u-56306e3a014d', 'u-me': 'Jin', 'u-gone': 'u-gone' })
    await settle()
    expect(seen).toEqual({ 'u-56306e3a014d': 'owner', 'u-me': 'Jin', 'u-gone': 'u-gone' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toEqual(['u-56306e3a014d', 'u-gone'])
    // Shown again: already known, unknown included -- no second ask.
    show(['u-gone', 'u-56306e3a014d'])
    await settle()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('falls back to the ids when the ask fails', async () => {
    setUserNamesFetcherForTests(vi.fn().mockRejectedValue(new Error('offline')))
    useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: me, token: 't1', expiresAt: null, notice: null })
    show(['u-1'])
    await settle()
    expect(seen).toEqual({ 'u-1': 'u-1' })
  })

  it('asks nothing with sign-in off, and still names the dev user', async () => {
    const fetcher = vi.fn()
    setUserNamesFetcherForTests(fetcher)
    show(['operator-dev', 'eng-1'])
    await settle()
    expect(fetcher).not.toHaveBeenCalled()
    expect(seen).toEqual({ 'operator-dev': 'Developer', 'eng-1': 'eng-1' })
  })
})

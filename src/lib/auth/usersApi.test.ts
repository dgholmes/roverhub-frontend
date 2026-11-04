import { describe, expect, it, vi } from 'vitest'
import { createUsersApi } from './usersApi'
import { ApiError } from '@/lib/realtime/apiError'

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

describe('usersApi', () => {
  it('PATCHes only the given changes', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { user_id: 'u1' }))
    await createUsersApi('http://a', f).update('u1', { site_roles: { '*': 'viewer' } })
    expect(f).toHaveBeenCalledWith('http://a/users/u1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ site_roles: { '*': 'viewer' } }) }))
  })

  it('throws the server\'s reason, e.g. for the last owner', async () => {
    const f = vi.fn().mockResolvedValue(res(409, { detail: 'this is the last owner; make someone else owner first' }))
    const err = await createUsersApi('http://a', f).update('u1', { disabled: true }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).detail).toBe('this is the last owner; make someone else owner first')
  })

  it('resets a password and signs a user out everywhere', async () => {
    const f = vi.fn().mockResolvedValue(res(204, null))
    const api = createUsersApi('http://a', f)
    await api.resetPassword('u1', 'longenough')
    await api.signOutEverywhere('u1')
    expect(f.mock.calls.map((c) => c[0])).toEqual(['http://a/users/u1/password', 'http://a/users/u1/sign-out'])
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthStore, SESSION_STORAGE_KEY } from './authStore'
import { createApiFetch } from './apiFetch'
import { DEV_USER, type AuthUser } from './types'

const API = 'http://api.test'
const NOW = 1_800_000_000_000 // ms

const ana: AuthUser = {
  user_id: 'u-ana', username: 'ana', display_name: 'Ana Lee', org_role: 'member',
  site_roles: { 'site-north-yard': 'operator' }, audit_access: false, disabled: false,
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    data,
  }
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

/** A fake backend: answers by path, records each request. */
function backend(routes: Record<string, () => Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const path = url.replace(API, '')
    const r = routes[path]
    if (!r) throw new TypeError('Failed to fetch')
    return r()
  })
  return { fetch: f as unknown as typeof fetch, calls }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('session boot', () => {
  it('in mock mode is the dev user, with no network calls', async () => {
    const b = backend({})
    const store = createAuthStore({ realBackend: false, apiBaseUrl: API, fetch: b.fetch, storage: memoryStorage() })
    expect(store.getState().status).toBe('off')
    await store.getState().boot()
    expect(store.getState()).toMatchObject({ status: 'off', authEnabled: false, user: DEV_USER })
    expect(b.calls).toHaveLength(0)
  })

  it('with sign-in off is the user /auth/me reports, and never signs in', async () => {
    const b = backend({
      '/auth/config': () => json(200, { auth_enabled: false, needs_first_owner: false }),
      '/auth/me': () => json(200, { auth_enabled: false, user: DEV_USER }),
    })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage: memoryStorage() })
    await store.getState().boot()
    expect(store.getState()).toMatchObject({ status: 'off', authEnabled: false, token: null })
    expect(store.getState().user?.user_id).toBe('operator-dev')
  })

  it('with sign-in on and a valid stored token is signed in as that user', async () => {
    const b = backend({
      '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: false }),
      '/auth/me': () => json(200, { auth_enabled: true, user: ana }),
    })
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: JSON.stringify({ access_token: 'tok', expires_at: NOW / 1000 + 3600 }) })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage, now: () => NOW })
    await store.getState().boot()
    expect(store.getState()).toMatchObject({ status: 'signedIn', authEnabled: true, token: 'tok', user: ana })
    const me = b.calls.find((c) => c.url.endsWith('/auth/me'))!
    expect((me.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('with sign-in on and an expired stored token is signed out without asking the server', async () => {
    const b = backend({ '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: false }) })
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: JSON.stringify({ access_token: 'old', expires_at: NOW / 1000 - 1 }) })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage, now: () => NOW })
    await store.getState().boot()
    expect(store.getState()).toMatchObject({ status: 'signedOut', token: null, user: null, notice: 'expired' })
    expect(b.calls.some((c) => c.url.endsWith('/auth/me'))).toBe(false)
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false)
  })

  it('with sign-in on and a revoked token is signed out', async () => {
    const b = backend({
      '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: false }),
      '/auth/me': () => json(401, { detail: 'sign in to continue' }),
    })
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: JSON.stringify({ access_token: 'tok', expires_at: NOW / 1000 + 3600 }) })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage, now: () => NOW })
    await store.getState().boot()
    expect(store.getState().status).toBe('signedOut')
  })

  it('reports needs_first_owner', async () => {
    const b = backend({ '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: true }) })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage: memoryStorage() })
    await store.getState().boot()
    expect(store.getState()).toMatchObject({ status: 'signedOut', needsFirstOwner: true, notice: null })
  })

  it('is unreachable, not signed out, when the backend does not answer', async () => {
    const b = backend({})
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage: memoryStorage() })
    await store.getState().boot()
    expect(store.getState().status).toBe('unreachable')
  })
})

describe('sign-in and expiry', () => {
  it('signs in, stores the token and expiry, and expires locally at expires_at', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const b = backend({
      '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: false }),
      '/auth/login': () => json(200, { access_token: 'new', token_type: 'bearer', expires_at: NOW / 1000 + 60, user: ana }),
    })
    const storage = memoryStorage()
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage })
    await store.getState().boot()
    expect(await store.getState().signIn('ana', 'pw')).toEqual({ ok: true })
    expect(store.getState()).toMatchObject({ status: 'signedIn', token: 'new', user: ana })
    expect(JSON.parse(storage.data.get(SESSION_STORAGE_KEY)!)).toEqual({ access_token: 'new', expires_at: NOW / 1000 + 60 })
    const login = b.calls.find((c) => c.url.endsWith('/auth/login'))!
    expect(login.init?.credentials).toBe('include')

    vi.advanceTimersByTime(60_000)
    expect(store.getState()).toMatchObject({ status: 'signedOut', token: null, notice: 'expired' })
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false)
  })

  it('returns the server\'s message for a wrong password', async () => {
    const b = backend({
      '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: false }),
      '/auth/login': () => json(401, { detail: 'wrong username or password' }),
    })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage: memoryStorage() })
    await store.getState().boot()
    expect(await store.getState().signIn('ana', 'nope')).toEqual({ ok: false, status: 401, detail: 'wrong username or password' })
    expect(store.getState().status).toBe('signedOut')
  })
})

describe('apiFetch', () => {
  async function signedInStore() {
    const b = backend({
      '/auth/config': () => json(200, { auth_enabled: true, needs_first_owner: false }),
      '/auth/me': () => json(200, { auth_enabled: true, user: ana }),
    })
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: JSON.stringify({ access_token: 'tok', expires_at: Date.now() / 1000 + 3600 }) })
    const store = createAuthStore({ realBackend: true, apiBaseUrl: API, fetch: b.fetch, storage })
    await store.getState().boot()
    expect(store.getState().status).toBe('signedIn')
    return store
  }

  it('adds the Bearer header and sends cookies, keeping the caller\'s headers', async () => {
    const store = await signedInStore()
    const f = vi.fn().mockResolvedValue(json(200, {}))
    vi.stubGlobal('fetch', f)
    await createApiFetch(store)(`${API}/robots/r1/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const [, init] = f.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('include')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' })
  })

  it('adds no Authorization header with sign-in off', async () => {
    const store = createAuthStore({ realBackend: false, apiBaseUrl: API, storage: memoryStorage() })
    const f = vi.fn().mockResolvedValue(json(200, {}))
    vi.stubGlobal('fetch', f)
    await createApiFetch(store)(`${API}/robots`)
    const [, init] = f.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toBeUndefined()
    expect(init.credentials).toBe('include')
  })

  it('ends the session on a 401', async () => {
    const store = await signedInStore()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { detail: 'sign in to continue' })))
    const r = await createApiFetch(store)(`${API}/robots`)
    expect(r.status).toBe(401)
    expect(store.getState()).toMatchObject({ status: 'signedOut', token: null, user: null })
  })

  it('leaves the session alone on a 403', async () => {
    const store = await signedInStore()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { detail: 'your role does not allow this' })))
    await createApiFetch(store)(`${API}/tasks/t1`, { method: 'PUT' })
    expect(store.getState().status).toBe('signedIn')
  })
})

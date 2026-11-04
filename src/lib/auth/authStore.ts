import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { API_BASE_URL, USE_REAL_BACKEND } from '@/lib/realtime/backendConfig'
import { DEV_USER, type AuthUser } from './types'

/**
 * Who is signed in, if anyone.
 *
 * - **Mock mode** (no backend): always the dev user, no network calls, and the
 *   console behaves exactly as it did before sign-in existed.
 * - **Real backend, sign-in off** (`GET /auth/config` says so): the same, with
 *   the user `/auth/me` reports (the backend's dev user).
 * - **Real backend, sign-in on**: a session token from `POST /auth/login`,
 *   kept in localStorage with its expiry so a reload stays signed in, checked
 *   against `/auth/me` on boot, and dropped locally when it expires.
 *
 * A session is renewed in the background (`POST /auth/refresh`) halfway
 * through each token's life, so a console that stays open is never cut off at
 * the token's expiry -- an operator mid-drive at hour twelve keeps driving.
 * What still ends a session: signing out, a password change, being disabled
 * or signed out everywhere (the next refresh is refused), or the console being
 * closed or asleep for longer than a token lasts.
 *
 * The token is sent as a Bearer header by `apiFetch` and used as the broker
 * password; the HttpOnly cookie the login also sets is what lets `<img>` and
 * download links to the backend through (the server accepts it for GET only).
 */

export type AuthStatus =
  /** Asking the backend whether sign-in is on. */
  | 'booting'
  /** The backend did not answer, so we cannot tell whether sign-in is on. */
  | 'unreachable'
  /** Sign-in is off (or mock mode): everyone is the dev user. */
  | 'off'
  | 'signedOut'
  | 'signedIn'

/** Why the sign-in page is showing, when it is not simply the first visit. */
export type AuthNotice = 'expired' | 'passwordChanged' | 'signedOut' | null

export type SignInResult = { ok: true } | { ok: false; status: number | null; detail: string | null }
export type ActionResult = { ok: true } | { ok: false; status: number | null; detail: string | null }

export interface AuthState {
  status: AuthStatus
  /** True when the backend has sign-in on. */
  authEnabled: boolean
  /** Sign-in is on and there are no users yet. */
  needsFirstOwner: boolean
  /** Signed-in user; the dev user when sign-in is off; null when signed out. */
  user: AuthUser | null
  token: string | null
  /** Unix seconds. */
  expiresAt: number | null
  notice: AuthNotice
  boot: () => Promise<void>
  signIn: (username: string, password: string) => Promise<SignInResult>
  /** Sign out here: tell the server (clears the cookie), forget the token. */
  signOut: () => Promise<void>
  /** Forget the session locally, e.g. on a 401 or at expiry. */
  endSession: (notice?: AuthNotice) => void
  /** Swap the token for a fresh one now. Runs on its own halfway through each
   * token's life; exposed for tests and for waking from sleep. */
  refreshSession: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<ActionResult>
}

export const SESSION_STORAGE_KEY = 'rh.session'

interface StoredSession { access_token: string; expires_at: number }

export interface AuthStoreDeps {
  realBackend: boolean
  apiBaseUrl: string
  /** Injectable for tests; defaults to the global fetch at call time. */
  fetch?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  now?: () => number
}

/** setTimeout's delay is a signed 32-bit int; longer delays fire at once. */
const MAX_TIMER_MS = 2_147_000_000
/** After a refresh that failed for want of a network or a server, try again
 * this soon -- until the token itself runs out. */
export const REFRESH_RETRY_MS = 30_000

async function detailOf(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { detail?: unknown }
    return typeof body?.detail === 'string' && body.detail.trim() ? body.detail : null
  } catch {
    return null
  }
}

function defaultStorage(): AuthStoreDeps['storage'] {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export type AuthStore = UseBoundStore<StoreApi<AuthState>>

export function createAuthStore(deps: AuthStoreDeps): AuthStore {
  const doFetch: typeof fetch = (...args) => (deps.fetch ?? fetch)(...args)
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const now = deps.now ?? Date.now
  const api = deps.apiBaseUrl
  let expiryTimer: ReturnType<typeof setTimeout> | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  /** Wall-clock ms after which the current token is due for renewal. */
  let refreshDueAt: number | null = null
  let refreshing: Promise<void> | null = null
  let booting: Promise<void> | null = null

  function readStored(): StoredSession | null {
    try {
      const raw = storage?.getItem(SESSION_STORAGE_KEY)
      if (!raw) return null
      const v = JSON.parse(raw) as Partial<StoredSession>
      return typeof v.access_token === 'string' && typeof v.expires_at === 'number'
        ? { access_token: v.access_token, expires_at: v.expires_at } : null
    } catch { return null }
  }
  function writeStored(s: StoredSession | null): void {
    try {
      if (s) storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(s))
      else storage?.removeItem(SESSION_STORAGE_KEY)
    } catch { /* the session then lasts this tab only */ }
  }

  const store = create<AuthState>((set, get) => {
    function clearTimer() {
      if (expiryTimer !== null) clearTimeout(expiryTimer)
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      expiryTimer = null
      refreshTimer = null
      refreshDueAt = null
    }

    function scheduleRefresh(delayMs: number) {
      if (refreshTimer !== null) clearTimeout(refreshTimer)
      refreshDueAt = now() + delayMs
      refreshTimer = setTimeout(() => { void get().refreshSession() }, Math.max(0, Math.min(delayMs, MAX_TIMER_MS)))
    }

    function startSession(user: AuthUser, token: string, expiresAt: number) {
      clearTimer()
      writeStored({ access_token: token, expires_at: expiresAt })
      set({ status: 'signedIn', authEnabled: true, user, token, expiresAt, notice: null })
      const ms = expiresAt * 1000 - now()
      expiryTimer = setTimeout(() => {
        if (get().token === token) get().endSession('expired')
      }, Math.max(0, Math.min(ms, MAX_TIMER_MS)))
      // Halfway through, so a failed attempt leaves half a token's life to retry in.
      scheduleRefresh(Math.max(0, ms / 2))
    }

    async function runRefresh(): Promise<void> {
      const { token, expiresAt } = get()
      if (!token || expiresAt === null) return
      let r: Response
      try {
        r = await doFetch(`${api}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        r = { ok: false, status: 0 } as Response
      }
      // Signed out, or signed in again, while this was in flight.
      if (get().token !== token) return
      if (r.ok) {
        const body = await r.json() as { access_token: string; expires_at: number; user: AuthUser }
        startSession(body.user, body.access_token, body.expires_at)
        return
      }
      if (r.status === 401 || r.status === 403) {
        // Revoked: password changed, disabled, or signed out everywhere.
        get().endSession('expired')
        return
      }
      // Network or server trouble: the token is still good, so keep using it
      // and try again; the expiry timer ends the session if this never works.
      const left = expiresAt * 1000 - now()
      if (left > 0) scheduleRefresh(Math.min(REFRESH_RETRY_MS, left / 2))
    }

    async function runBoot(): Promise<void> {
      if (!deps.realBackend) {
        set({ status: 'off', authEnabled: false, needsFirstOwner: false, user: DEV_USER, token: null, expiresAt: null })
        return
      }
      set({ status: 'booting' })
      let config: { auth_enabled?: boolean; needs_first_owner?: boolean }
      try {
        const r = await doFetch(`${api}/auth/config`, { credentials: 'include' })
        if (!r.ok) throw new Error(`GET /auth/config answered ${r.status}`)
        config = await r.json()
      } catch {
        set({ status: 'unreachable' })
        return
      }

      if (!config.auth_enabled) {
        // Sign-in off: who the backend says we are, which is its dev user.
        let user = DEV_USER
        try {
          const r = await doFetch(`${api}/auth/me`, { credentials: 'include' })
          if (r.ok) user = ((await r.json()) as { user?: AuthUser }).user ?? DEV_USER
        } catch { /* keep the dev user */ }
        writeStored(null)
        set({ status: 'off', authEnabled: false, needsFirstOwner: false, user, token: null, expiresAt: null })
        return
      }

      const needsFirstOwner = Boolean(config.needs_first_owner)
      const stored = readStored()
      if (!stored || stored.expires_at * 1000 <= now()) {
        writeStored(null)
        set({ status: 'signedOut', authEnabled: true, needsFirstOwner, user: null, token: null, expiresAt: null, notice: stored ? 'expired' : null })
        return
      }
      try {
        const r = await doFetch(`${api}/auth/me`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${stored.access_token}` },
        })
        if (r.status === 401 || r.status === 403) {
          writeStored(null)
          set({ status: 'signedOut', authEnabled: true, needsFirstOwner, user: null, token: null, expiresAt: null, notice: 'expired' })
          return
        }
        if (!r.ok) throw new Error(`GET /auth/me answered ${r.status}`)
        const body = await r.json() as { user: AuthUser }
        set({ needsFirstOwner })
        startSession(body.user, stored.access_token, stored.expires_at)
      } catch {
        set({ status: 'unreachable', authEnabled: true, needsFirstOwner })
      }
    }

    return {
      // Mock mode has nothing to ask, so it starts where boot would leave it.
      status: deps.realBackend ? 'booting' : 'off',
      authEnabled: false,
      needsFirstOwner: false,
      user: deps.realBackend ? null : DEV_USER,
      token: null,
      expiresAt: null,
      notice: null,

      boot: () => {
        booting ??= runBoot().finally(() => { booting = null })
        return booting
      },

      signIn: async (username, password) => {
        let r: Response
        try {
          r = await doFetch(`${api}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          })
        } catch {
          return { ok: false, status: null, detail: null }
        }
        if (!r.ok) return { ok: false, status: r.status, detail: await detailOf(r) }
        const body = await r.json() as { access_token: string; expires_at: number; user: AuthUser }
        set({ needsFirstOwner: false })
        startSession(body.user, body.access_token, body.expires_at)
        return { ok: true }
      },

      signOut: async () => {
        const token = get().token
        get().endSession('signedOut')
        try {
          await doFetch(`${api}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
        } catch { /* the token is gone here either way */ }
      },

      refreshSession: () => {
        refreshing ??= runRefresh().finally(() => { refreshing = null })
        return refreshing
      },

      endSession: (notice = null) => {
        clearTimer()
        writeStored(null)
        if (!get().authEnabled) return
        set({ status: 'signedOut', user: null, token: null, expiresAt: null, notice })
      },

      changePassword: async (currentPassword, newPassword) => {
        const token = get().token
        let r: Response
        try {
          r = await doFetch(`${api}/auth/password`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
          })
        } catch {
          return { ok: false, status: null, detail: null }
        }
        if (r.status === 401) { get().endSession('expired'); return { ok: false, status: 401, detail: null } }
        if (!r.ok) return { ok: false, status: r.status, detail: await detailOf(r) }
        // The server ended every session of this user, this one included.
        get().endSession('passwordChanged')
        return { ok: true }
      },
    }
  })

  // A laptop that slept through the refresh point: timers were paused, so
  // renew as soon as the console is looked at again rather than whenever the
  // late timer gets round to it.
  if (deps.realBackend && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (store.getState().status === 'signedIn' && refreshDueAt !== null && now() >= refreshDueAt) {
        void store.getState().refreshSession()
      }
    })
  }
  return store
}

/** The console's one session. */
export const useAuthStore = createAuthStore({ realBackend: USE_REAL_BACKEND, apiBaseUrl: API_BASE_URL })

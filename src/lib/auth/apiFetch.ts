import { useAuthStore, type AuthStore } from './authStore'

/**
 * fetch for the RoverHub backend: adds the session's Bearer token and sends
 * cookies, and on a 401 ends the session so the sign-in page shows.
 *
 * Never throws for an HTTP status; callers read `response.ok` as before. A 403
 * (the role does not allow it) is left to the caller, whose `apiErrorFrom`
 * already carries the server's readable `detail`.
 *
 * Not for the edge device (webrtcVideo.ts): that is a different server, which
 * has no idea who we are.
 */
export function createApiFetch(store: AuthStore) {
  return async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = store.getState().token
    const request: RequestInit = { ...init, credentials: 'include' }
    if (token) request.headers = withAuthorization(init.headers, `Bearer ${token}`)
    const response = await fetch(url, request)
    if (response.status === 401) {
      const { authEnabled, token: current } = store.getState()
      // Only the session that made the request: a 401 that lands after the
      // user has signed in again must not sign them out.
      if (authEnabled && current === token) store.getState().endSession('expired')
    }
    return response
  }
}

/** `headers` plus Authorization, keeping a plain object a plain object. */
function withAuthorization(headers: HeadersInit | undefined, value: string): HeadersInit {
  if (headers instanceof Headers) {
    const h = new Headers(headers)
    h.set('Authorization', value)
    return h
  }
  if (Array.isArray(headers)) return [...headers, ['Authorization', value]]
  return { ...(headers ?? {}), Authorization: value }
}

export const apiFetch = createApiFetch(useAuthStore)

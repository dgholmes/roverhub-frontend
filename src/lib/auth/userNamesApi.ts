import { API_BASE_URL } from '@/lib/realtime/backendConfig'
import { apiErrorFrom } from '@/lib/realtime/apiError'
import { apiFetch as defaultApiFetch } from './apiFetch'

/** The backend asks for at most this many ids at a time (`GET /users/names`). */
export const MAX_NAME_IDS = 50

/**
 * `GET /users/names?ids=a,b,c`: a name for each user id, for anyone signed in
 * -- so a history can say "owner" instead of user-56306e3a014d. Unknown ids
 * are left out of the answer. More than MAX_NAME_IDS ids go in several asks.
 */
export function createUserNamesApi(base = API_BASE_URL, apiFetch = defaultApiFetch) {
  return async function fetchUserNames(ids: readonly string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (let i = 0; i < ids.length; i += MAX_NAME_IDS) {
      const chunk = ids.slice(i, i + MAX_NAME_IDS)
      const response = await apiFetch(`${base}/users/names?ids=${chunk.map(encodeURIComponent).join(',')}`)
      if (!response.ok) throw await apiErrorFrom(response, 'GET /users/names')
      const body = (await response.json()) as { names?: unknown }
      const names = body && typeof body.names === 'object' && body.names !== null ? body.names as Record<string, unknown> : {}
      for (const [id, name] of Object.entries(names)) if (typeof name === 'string' && name.trim()) out[id] = name
    }
    return out
  }
}

export const fetchUserNames = createUserNamesApi()

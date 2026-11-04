import { API_BASE_URL } from '@/lib/realtime/backendConfig'
import { apiErrorFrom } from '@/lib/realtime/apiError'
import type { OrgRole, SiteRole } from '@/org/roles'
import { apiFetch as defaultApiFetch } from './apiFetch'
import type { AuthUser } from './types'

/** The backend's user management (org owner/admin only). Every failure throws
 * an ApiError whose `detail` is the server's readable reason, e.g. "this is the
 * last owner; make someone else owner first". */

export interface NewUser {
  username: string
  display_name: string
  password: string
  org_role: OrgRole
  site_roles: Record<string, SiteRole>
  audit_access: boolean
}

export type UserChanges = Partial<Pick<AuthUser, 'display_name' | 'org_role' | 'site_roles' | 'audit_access' | 'disabled'>>

export function createUsersApi(base = API_BASE_URL, apiFetch = defaultApiFetch) {
  const json = { 'Content-Type': 'application/json' }
  const user = (id: string) => `${base}/users/${encodeURIComponent(id)}`

  async function ok(response: Response, what: string): Promise<Response> {
    if (!response.ok) throw await apiErrorFrom(response, what)
    return response
  }

  return {
    async list(): Promise<AuthUser[]> {
      return (await ok(await apiFetch(`${base}/users`), 'GET /users')).json()
    },
    async create(body: NewUser): Promise<AuthUser> {
      return (await ok(await apiFetch(`${base}/users`, { method: 'POST', headers: json, body: JSON.stringify(body) }), 'POST /users')).json()
    },
    async update(id: string, changes: UserChanges): Promise<AuthUser> {
      return (await ok(await apiFetch(user(id), { method: 'PATCH', headers: json, body: JSON.stringify(changes) }), 'PATCH /users')).json()
    },
    async resetPassword(id: string, newPassword: string): Promise<void> {
      await ok(await apiFetch(`${user(id)}/password`, { method: 'POST', headers: json, body: JSON.stringify({ new_password: newPassword }) }), 'POST /users/password')
    },
    async signOutEverywhere(id: string): Promise<void> {
      await ok(await apiFetch(`${user(id)}/sign-out`, { method: 'POST' }), 'POST /users/sign-out')
    },
  }
}

export type UsersApi = ReturnType<typeof createUsersApi>
export const usersApi = createUsersApi()

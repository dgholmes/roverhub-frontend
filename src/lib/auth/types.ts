import type { OrgRole, SiteRole } from '@/org/roles'

/** `site_roles` key that means every site. */
export const ALL_SITES = '*'

/** A user as the backend returns it (roverhub-backend auth/users.py `public()`). */
export interface AuthUser {
  user_id: string
  username: string
  display_name: string
  org_role: OrgRole
  /** site id (or `'*'` for every site) -> role there. A site missing here,
   * with no `'*'`, means no access. */
  site_roles: Record<string, SiteRole>
  audit_access: boolean
  disabled: boolean
  token_version?: number
  created_at?: string | null
  last_login_at?: string | null
}

/** Who commands are attributed to, and who the console is, when sign-in is
 * off -- the backend's DEV_USER_ID. Kept identical so a console without
 * sign-in still reads its own `control_owner` as "you". */
export const DEV_OPERATOR_ID = 'operator-dev'

/** The user `/auth/me` reports when sign-in is off, also used in mock mode
 * where there is no backend to ask. */
export const DEV_USER: AuthUser = {
  user_id: DEV_OPERATOR_ID,
  username: DEV_OPERATOR_ID,
  display_name: 'Developer',
  org_role: 'owner',
  site_roles: { [ALL_SITES]: 'supervisor' },
  audit_access: true,
  disabled: false,
}

/** The user's role at `siteId`: a role for that site, else their every-site
 * role, else none. */
export function siteRoleFor(user: Pick<AuthUser, 'site_roles'> | null | undefined, siteId: string): SiteRole | null {
  if (!user) return null
  return user.site_roles[siteId] ?? user.site_roles[ALL_SITES] ?? null
}

export function isOrgAdmin(user: Pick<AuthUser, 'org_role'> | null | undefined): boolean {
  return user?.org_role === 'owner' || user?.org_role === 'admin'
}

/** A name to show for a user: their display name, else their username. */
export function displayNameOf(user: Pick<AuthUser, 'display_name' | 'username'>): string {
  return user.display_name?.trim() || user.username
}

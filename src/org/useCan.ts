import { useSessionStore } from '@/store/useSessionStore'
import { useAuthStore } from '@/lib/auth/authStore'
import { siteRoleFor, type AuthUser } from '@/lib/auth/types'
import type { AuthStatus } from '@/lib/auth/authStore'
import { can, type CapabilityId, type SiteRole } from './roles'

/** The role the console shows and hides things for at `siteId`.
 *
 * Signed in, it is the user's own role there (`site_roles[siteId]`, else their
 * every-site role `'*'`), or null when they have none: no access to this site.
 * With sign-in off it is the Role preview picked under Settings, as before. */
export function siteRoleOf(
  auth: { status: AuthStatus; user: Pick<AuthUser, 'site_roles'> | null },
  preview: SiteRole,
  siteId: string,
): SiteRole | null {
  return auth.status === 'signedIn' ? siteRoleFor(auth.user, siteId) : preview
}

/** The current role at the active site; null means no access to it. */
export function useSiteRole(): SiteRole | null {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const preview = useSessionStore((s) => s.role)
  const siteId = useSessionStore((s) => s.activeSiteId)
  return siteRoleOf({ status, user }, preview, siteId)
}

/** Whether the current role may see or use something. The browser only shows
 * and hides; with sign-in on, the backend is what decides. */
export function useCan(id: CapabilityId): boolean {
  const role = useSiteRole()
  return role !== null && can(role, id)
}

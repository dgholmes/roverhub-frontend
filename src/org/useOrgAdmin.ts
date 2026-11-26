import { useAuthStore, type AuthStatus } from '@/lib/auth/authStore'
import { isOrgAdmin, type AuthUser } from '@/lib/auth/types'

/** Whether this session may create, edit and delete sites: an organisation
 * owner or admin (spec 2026-11-26 §2, `org_admin` in the backend's
 * auth/policy.py). With sign-in off everyone is the dev user, who may, as the
 * backend agrees. The browser only shows and hides; the backend decides. */
export function orgAdminOf(auth: { status: AuthStatus; user: Pick<AuthUser, 'org_role'> | null }): boolean {
  return auth.status !== 'signedIn' || isOrgAdmin(auth.user)
}

export function useOrgAdmin(): boolean {
  return useAuthStore((s) => orgAdminOf(s))
}

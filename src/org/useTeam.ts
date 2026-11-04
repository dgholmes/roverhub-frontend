import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth/authStore'
import { isOrgAdmin, type AuthUser } from '@/lib/auth/types'
import { usersApi } from '@/lib/auth/usersApi'
import { orgMembers, type Member } from './orgData'

/** Where the Team page's member list comes from.
 *
 * - `sample`: sign-in off against mock data -- example members, as before.
 * - `missing`: sign-in off against a real backend -- there are no accounts.
 * - `adminsOnly`: signed in, but only org owners and admins may list users.
 * - `live`: signed in as an owner or admin -- the backend's users, editable. */
export type TeamSource =
  | { kind: 'sample'; members: Member[] }
  | { kind: 'missing' }
  | { kind: 'adminsOnly' }
  | { kind: 'live'; users: AuthUser[] | null; error: string | null; reload: () => Promise<void>; replace: (u: AuthUser) => void }

export function useTeam(): TeamSource {
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const admin = useAuthStore((s) => isOrgAdmin(s.user))
  const live = signedIn && admin
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setUsers(await usersApi.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const replace = useCallback((u: AuthUser) => {
    setUsers((list) => {
      if (!list) return [u]
      return list.some((x) => x.user_id === u.user_id) ? list.map((x) => (x.user_id === u.user_id ? u : x)) : [...list, u]
    })
  }, [])

  useEffect(() => { if (live) void reload() }, [live, reload])

  if (live) return { kind: 'live', users, error, reload, replace }
  if (signedIn) return { kind: 'adminsOnly' }
  return orgMembers ? { kind: 'sample', members: orgMembers } : { kind: 'missing' }
}

import { useEffect, useState } from 'react'
import { useAuthStore } from './authStore'
import { displayNameOf } from './types'
import { fetchUserNames as defaultFetch } from './userNamesApi'

/**
 * Names for user ids, for lists that record who did something (the lidar
 * mount's history): `names[id]` is the person's name, or the id itself when
 * it is not known -- sign-in off, an id the backend does not know, or the ask
 * failed. The signed-in user's own name needs no ask.
 *
 * Asked once per id per session (`GET /users/names`), shared by every list on
 * the page; an id the backend did not know is not asked again, a failed ask
 * is (next time a list needs it).
 */

type Cache = { session: string; names: Map<string, string | null>; asking: Set<string> }
let cache: Cache = { session: '', names: new Map(), asking: new Set() }
const listeners = new Set<() => void>()
let fetcher: (ids: readonly string[]) => Promise<Record<string, string>> = defaultFetch

/** Tests: a fake backend, and a clean cache. */
export function setUserNamesFetcherForTests(f: typeof fetcher | null): void {
  fetcher = f ?? defaultFetch
  cache = { session: '', names: new Map(), asking: new Set() }
}

function forSession(session: string): Cache {
  if (cache.session !== session) cache = { session, names: new Map(), asking: new Set() }
  return cache
}

function ask(session: string, ids: string[]): void {
  const c = forSession(session)
  const wanted = ids.filter((id) => !c.names.has(id) && !c.asking.has(id))
  if (wanted.length === 0) return
  wanted.forEach((id) => c.asking.add(id))
  fetcher(wanted).then(
    (names) => {
      if (cache !== c) return
      // Unknown ids are left out of the answer: remember them as unknown.
      for (const id of wanted) c.names.set(id, names[id] ?? null)
    },
    () => { /* the ids stand in for names; asked again next time */ },
  ).finally(() => {
    wanted.forEach((id) => c.asking.delete(id))
    if (cache === c) listeners.forEach((l) => l())
  })
}

export function useUserNames(ids: readonly (string | null | undefined)[]): Readonly<Record<string, string>> {
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const me = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const [, setTick] = useState(0)
  const key = [...new Set(ids.filter((id): id is string => !!id))].sort().join('\n')
  // The token marks the session: a new sign-in may see other names.
  const session = signedIn ? `${me?.user_id ?? ''}:${token ?? ''}` : ''

  useEffect(() => {
    const listener = () => setTick((n) => n + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    if (!signedIn || !key) return
    ask(session, key.split('\n').filter((id) => id !== me?.user_id))
  }, [signedIn, session, key, me?.user_id])

  // Cheap enough to build on every render; a new answer re-renders through
  // the listener above.
  const c = signedIn ? forSession(session) : null
  const out: Record<string, string> = {}
  for (const id of key ? key.split('\n') : []) {
    if (me && id === me.user_id) out[id] = displayNameOf(me)
    else out[id] = c?.names.get(id) || id
  }
  return out
}

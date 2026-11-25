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

type Cache = {
  session: string
  names: Map<string, string | null>
  asking: Set<string>
  /** Ids userNameOf has asked for. It asks during render, so it asks once:
   * re-asking a failed id on every render would loop (fail, re-render, ask). */
  askedSync: Set<string>
}
const emptyCache = (session: string): Cache => ({ session, names: new Map(), asking: new Set(), askedSync: new Set() })
let cache: Cache = emptyCache('')
const listeners = new Set<() => void>()
let fetcher: (ids: readonly string[]) => Promise<Record<string, string>> = defaultFetch

/** Tests: a fake backend, and a clean cache. */
export function setUserNamesFetcherForTests(f: typeof fetcher | null): void {
  fetcher = f ?? defaultFetch
  cache = emptyCache('')
}

/** Tests: names already known in the current session, as if asked. */
export function seedUserNamesForTests(names: Record<string, string>): void {
  const c = forSession(sessionOf(useAuthStore.getState()) ?? '')
  for (const [id, name] of Object.entries(names)) c.names.set(id, name)
  listeners.forEach((l) => l())
}

function forSession(session: string): Cache {
  if (cache.session !== session) cache = emptyCache(session)
  return cache
}

/** The cache key for who is signed in, or null when nobody is (sign-in off
 * included: then there is nobody to ask about). The token marks the session:
 * a new sign-in may see other names. */
function sessionOf(s: { status: string; user: { user_id: string } | null; token: string | null }): string | null {
  return s.status === 'signedIn' ? `${s.user?.user_id ?? ''}:${s.token ?? ''}` : null
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

/**
 * One person's name, for helpers that build their words outside React (the
 * command policy, the task bar): the name if known, the signed-in user's own
 * name, else the id itself. An id not yet known is asked for once; a
 * component showing the result re-renders when it arrives only if it also
 * calls useUserNames (or useControlHolderNames) with that id.
 */
export function userNameOf(id: string): string {
  const auth = useAuthStore.getState()
  if (auth.user && id === auth.user.user_id) return displayNameOf(auth.user)
  const session = sessionOf(auth)
  if (session === null) return id
  const c = forSession(session)
  const name = c.names.get(id)
  if (name) return name
  if (!c.names.has(id) && !c.askedSync.has(id)) {
    c.askedSync.add(id)
    ask(session, [id])
  }
  return id
}

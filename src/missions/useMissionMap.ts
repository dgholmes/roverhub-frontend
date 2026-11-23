import { useCallback, useEffect, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useSiteMapStore } from '@/store/useSiteMapStore'
import type { SiteMap } from '@/types/maps'

/**
 * What the mission editor does with a mission's `map_id`.
 *
 * - `map`: plan on it.
 * - `missing`, `unavailable`, `loading`: refuse to plan. A mission can name a
 *   map that was deleted or replaced, and an empty canvas looks exactly like
 *   open floor, so there is no canvas to click until the map is known.
 * - `none`: the mission names no map, so the plain grid (and its "no site map"
 *   badge) is all there is, as it always was.
 */
export type MissionMap =
  | { status: 'map'; map: SiteMap }
  | { status: 'missing' }
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'none' }

/** What `getMap` last said for the mission's id: undefined before it answers,
 * null for "no such map", 'error' for a failure that is not a 404. */
export type Fetched = SiteMap | null | undefined | 'error'

export function resolveMissionMap({ missionMapId, siteMap, maps, fetched }: {
  missionMapId: string
  siteMap: SiteMap | undefined
  /** The site's maps as listed (useSiteMapStore.maps): a map in it needs no fetch. */
  maps?: readonly SiteMap[] | null
  fetched: Fetched
}): MissionMap {
  // A mission that names no map plans on the plain grid. One that names a map
  // that does not resolve is MISSING, whatever else the site has: if that was
  // the site's only map, "this site has no maps" is exactly what a deletion
  // looks like, and must not read as permission to draw on empty floor.
  if (!missionMapId) return { status: 'none' }
  if (siteMap && siteMap.map_id === missionMapId) return { status: 'map', map: siteMap }
  const listed = maps?.find((m) => m.map_id === missionMapId)
  if (listed) return { status: 'map', map: listed }
  if (fetched === undefined) return { status: 'loading' }
  if (fetched === 'error') return { status: 'unavailable' }
  return fetched ? { status: 'map', map: fetched } : { status: 'missing' }
}

/** What MissionEditor hands MissionMapEditor for a resolved map. `map: null` is
 * the one value that refuses to plan, so every state but a known map, or "this
 * mission names none", produces it. A map that is gone or failed to load offers
 * the site's own as a way forward; while loading the map may still turn up. */
export function mapPropsFor(resolved: MissionMap, siteMap: SiteMap | undefined): {
  map: SiteMap | null | undefined
  refusal?: 'loading' | 'unavailable'
  replacement?: SiteMap
} {
  switch (resolved.status) {
    case 'map': return { map: resolved.map }
    case 'none': return { map: undefined }
    case 'missing': return { map: null, replacement: siteMap }
    case 'unavailable': return { map: null, refusal: 'unavailable', replacement: siteMap }
    default: return { map: null, refusal: 'loading' }
  }
}

/** The site's surveyed map, loaded once and shared with every other view (see
 * useSiteMapStore). */
export function useSiteMapFor(siteId: string): { map: SiteMap | undefined } {
  const map = useSiteMapStore((s) => s.map)
  const load = useSiteMapStore((s) => s.load)
  useEffect(() => { void load(siteId) }, [load, siteId])
  return { map: map ?? undefined }
}

/** The site's maps as last listed (null until the list loads, or when it
 * failed), and the one Missions shows by default (`pickSiteMap`). Shares the
 * one fetch useSiteMapFor makes. A mission is judged by its own map from this
 * list, never by the shown one: a site can hold several. */
export function useSiteMaps(siteId: string): { maps: SiteMap[] | null; shown: SiteMap | undefined } {
  const { map: shown } = useSiteMapFor(siteId)
  const maps = useSiteMapStore((s) => (s.siteId === siteId ? s.maps : null))
  return { maps, shown }
}

/** Resolve a mission's map for the editor: the site's own when it is the one
 * named, else from the site's list, else one `getMap` fetch per id. `retry`
 * fetches again after a failure. */
export function useMissionMap(siteId: string, missionMapId: string): { resolved: MissionMap; retry: () => void } {
  const { maps, shown: siteMap } = useSiteMaps(siteId)
  const [answer, setAnswer] = useState<{ id: string; fetched: Fetched } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const needsFetch = missionMapId !== '' && (!siteMap || siteMap.map_id !== missionMapId)
    && !maps?.some((m) => m.map_id === missionMapId)

  useEffect(() => {
    if (!needsFetch) return
    let current = true
    dataProvider.getMap(missionMapId).then(
      (m) => { if (current) setAnswer({ id: missionMapId, fetched: m }) },
      (e) => {
        console.warn('mission map could not be fetched', e)
        if (current) setAnswer({ id: missionMapId, fetched: 'error' })
      },
    )
    return () => { current = false }
  }, [missionMapId, needsFetch, attempt])

  const retry = useCallback(() => { setAnswer(null); setAttempt((n) => n + 1) }, [])
  // An answer for another id is no answer: the editor can switch missions.
  const fetched = answer && answer.id === missionMapId ? answer.fetched : undefined
  return { resolved: resolveMissionMap({ missionMapId, siteMap, maps, fetched }), retry }
}

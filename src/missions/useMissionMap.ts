import { useEffect, useState } from 'react'
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
 * - `none`: the site has no surveyed map at all, so the plain grid (and its
 *   "no site map" badge) is all there is, as it always was.
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

export function resolveMissionMap({ missionMapId, siteMap, siteLoaded, fetched }: {
  missionMapId: string
  siteMap: SiteMap | undefined
  siteLoaded: boolean
  fetched: Fetched
}): MissionMap {
  if (siteMap && siteMap.map_id === missionMapId) return { status: 'map', map: siteMap }
  if (fetched === undefined) return { status: 'loading' }
  if (fetched === 'error') return { status: 'unavailable' }
  if (fetched) return { status: 'map', map: fetched }
  // The id resolves to nothing. Whether that is "deleted" or "this site was
  // never surveyed" depends on the site's own map, which may still be loading.
  if (!siteLoaded) return { status: 'loading' }
  return siteMap ? { status: 'missing' } : { status: 'none' }
}

/** What MissionEditor hands MissionMapEditor for a resolved map. `map: null` is
 * the one value that refuses to plan, so every state but a known map, or "this
 * site has none", produces it. Only a missing map offers the site's own as a
 * replacement: while loading or unavailable the map may still turn up. */
export function mapPropsFor(resolved: MissionMap, siteMap: SiteMap | undefined): {
  map: SiteMap | null | undefined
  refusal?: 'loading' | 'unavailable'
  replacement?: SiteMap
} {
  switch (resolved.status) {
    case 'map': return { map: resolved.map }
    case 'none': return { map: undefined }
    case 'missing': return { map: null, replacement: siteMap }
    default: return { map: null, refusal: resolved.status }
  }
}

/** The site's surveyed map, loaded once and shared with every other view (see
 * useSiteMapStore). `loaded` is false until the maps have answered. */
export function useSiteMapFor(siteId: string): { map: SiteMap | undefined; loaded: boolean } {
  const map = useSiteMapStore((s) => s.map)
  const loaded = useSiteMapStore((s) => s.loaded)
  const load = useSiteMapStore((s) => s.load)
  useEffect(() => { void load(siteId) }, [load, siteId])
  return { map: map ?? undefined, loaded }
}

/** Resolve a mission's map for the editor: the site's own when it is the one
 * named, else one `getMap` fetch per id. */
export function useMissionMap(siteId: string, missionMapId: string): MissionMap {
  const { map: siteMap, loaded: siteLoaded } = useSiteMapFor(siteId)
  const [answer, setAnswer] = useState<{ id: string; fetched: Fetched } | null>(null)
  const needsFetch = !siteMap || siteMap.map_id !== missionMapId

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
  }, [missionMapId, needsFetch])

  // An answer for another id is no answer: the editor can switch missions.
  const fetched = answer && answer.id === missionMapId ? answer.fetched : undefined
  return resolveMissionMap({ missionMapId, siteMap, siteLoaded, fetched })
}

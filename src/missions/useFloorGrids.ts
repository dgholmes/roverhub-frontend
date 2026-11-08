import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/auth/apiFetch'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { SiteMap } from '@/types/maps'
import { parsePgm, type GridPixels } from './floorCells'

/** One decode per floor per survey, kept for the session. Keyed by the map's
 * `updated_at` too, so a re-survey under the same id is not served stale. A
 * failure is dropped, not kept, so the next look retries. */
const cache = new Map<string, Promise<GridPixels | null>>()

export function loadGrid(url: string, key: string): Promise<GridPixels | null> {
  let hit = cache.get(key)
  if (!hit) {
    hit = apiFetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`)
        const grid = parsePgm(new Uint8Array(await response.arrayBuffer()))
        if (!grid) throw new Error(`${url} is not a P5 grid of the size its header says`)
        return grid
      })
      .catch((e) => {
        console.warn('floor grid unavailable; waypoints on it will not be checked for open ground', e)
        cache.delete(key)
        return null
      })
    cache.set(key, hit)
  }
  return hit
}

/** Each floor's grid to fetch. A floor whose URL is empty is left out: mock mode
 * has no stored files, and fetching '' would re-request the current page. */
export function gridRequests(map: SiteMap): { index: number; url: string; key: string }[] {
  return map.floors.flatMap((floor) => {
    const url = dataProvider.mapArtifactUrl(map.map_id, floor.index, 'grid')
    return url ? [{ index: floor.index, url, key: `${map.map_id}@${map.updated_at}/${floor.index}` }] : []
  })
}

const NONE: Readonly<Record<number, GridPixels>> = Object.freeze({})

/**
 * The decoded occupancy grid of each of a map's floors, by floor index, as they
 * arrive. A floor whose grid is unavailable is simply absent: nothing is then
 * said about waypoints on it, which is not the same as saying they are free.
 *
 * Mock mode has no stored files and returns an empty URL, so nothing is fetched
 * (`fetch('')` would re-request the page).
 */
export function useFloorGrids(map: SiteMap | undefined): Readonly<Record<number, GridPixels>> {
  const stamp = map ? `${map.map_id}@${map.updated_at}` : null
  const [loaded, setLoaded] = useState<{ stamp: string | null; grids: Readonly<Record<number, GridPixels>> }>({ stamp: null, grids: NONE })

  useEffect(() => {
    if (!map || !stamp) return
    let current = true
    for (const { index, url, key } of gridRequests(map)) {
      void loadGrid(url, key).then((grid) => {
        if (!current || !grid) return
        setLoaded((prev) => ({
          stamp,
          grids: { ...(prev.stamp === stamp ? prev.grids : NONE), [index]: grid },
        }))
      })
    }
    return () => { current = false }
    // `map` is covered by `stamp`: a new object with the same id and time is the same survey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  return loaded.stamp === stamp ? loaded.grids : NONE
}

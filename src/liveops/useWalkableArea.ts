import { useEffect, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { loadGrid } from '@/missions/useFloorGrids'
import type { MapFloor, SiteMap } from '@/types/maps'
import { analyseWalkable, type WalkableAnalysis } from './walkable'

/**
 * A floor's planning grid (schema 0.0.17), fetched and analysed into where the
 * robot may walk -- once per floor per survey, kept for the session, the way
 * useFloorGrids keeps the survey grids. The analysis (a distance transform and
 * a region labelling over ~900k cells) runs when the file arrives, never during
 * a render.
 */

export type WalkableStatus =
  /** The floor has no planning grid (or, in mock mode, no stored files). */
  | { state: 'none' }
  | { state: 'loading' }
  /** It has one, but it could not be fetched or read. */
  | { state: 'failed' }
  | { state: 'ready'; analysis: WalkableAnalysis }

const NONE: WalkableStatus = Object.freeze({ state: 'none' })
const LOADING: WalkableStatus = Object.freeze({ state: 'loading' })
const FAILED: WalkableStatus = Object.freeze({ state: 'failed' })

/** Analyses by grid key. A failure is dropped, not kept, so the next look retries. */
const cache = new Map<string, Promise<WalkableAnalysis | null>>()

/** What to fetch for a floor's planning grid, or null when there is nothing to. */
export function planningRequest(map: SiteMap, floor: MapFloor): { url: string; key: string } | null {
  if (!floor.planning) return null
  const url = dataProvider.mapArtifactUrl(map.map_id, floor.index, 'planning')
  if (!url) return null
  return { url, key: `${map.map_id}@${map.updated_at}/${floor.index}/planning@${floor.planning.clearance_m}` }
}

export function loadWalkable(map: SiteMap, floor: MapFloor): Promise<WalkableAnalysis | null> {
  const request = planningRequest(map, floor)
  if (!request || !floor.planning) return Promise.resolve(null)
  const { url, key } = request
  const clearance = floor.planning.clearance_m
  let hit = cache.get(key)
  if (!hit) {
    hit = loadGrid(url, key).then((grid) => {
      if (!grid) { cache.delete(key); return null }
      const [w, h] = floor.size_cells
      // The planning grid shares the floor's frame cell for cell. One that does
      // not is not this floor's, and placing it would shift every verdict.
      if (grid.width !== w || grid.height !== h) {
        console.warn(`planning grid is ${grid.width}x${grid.height}, floor ${floor.index} is ${w}x${h}; not drawn or used`)
        cache.delete(key)
        return null
      }
      return analyseWalkable(grid, floor.resolution_m, clearance)
    }).catch((e) => {
      console.warn('planning grid could not be analysed; goals will not be checked against it', e)
      cache.delete(key)
      return null
    })
    cache.set(key, hit)
  }
  return hit
}

/** The shown floor's walkable analysis, as it loads. */
export function useWalkableArea(map: SiteMap | undefined, floor: MapFloor | undefined): WalkableStatus {
  const request = map && floor ? planningRequest(map, floor) : null
  const key = request?.key ?? null
  const [loaded, setLoaded] = useState<{ key: string | null; status: WalkableStatus }>({ key: null, status: NONE })

  useEffect(() => {
    if (!key || !map || !floor) return
    let current = true
    void loadWalkable(map, floor).then((analysis) => {
      if (current) setLoaded({ key, status: analysis ? { state: 'ready', analysis } : FAILED })
    })
    return () => { current = false }
    // `map` and `floor` are covered by `key`: the same survey, floor and clearance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!key) return NONE
  return loaded.key === key ? loaded.status : LOADING
}

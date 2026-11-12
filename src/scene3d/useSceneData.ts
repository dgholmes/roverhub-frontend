import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/auth/apiFetch'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { parsePgm, type GridPixels } from '@/missions/floorCells'
import type { MapFloor, SiteMap } from '@/types/maps'
import { buildSceneData, parseCloudBin } from './sceneData'
import type { SceneData } from './types'

export type SceneDataStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

export interface SceneDataState {
  status: SceneDataStatus
  data: SceneData | null
  /** Why there is no scene, for `unavailable` and `error`. A diagnostic, not
   * operator copy: the UI says it in its own words. */
  reason?: string
}

/** What one load ends in. */
export type SceneOutcome =
  | { status: 'ready'; data: SceneData }
  | { status: 'unavailable' | 'error'; reason: string }

/** What to fetch for one floor, or why there is nothing to fetch. */
type SceneRequest =
  | { kind: 'fetch'; key: string; floor: MapFloor; urls: { grid: string; planning: string; cloud: string } }
  | { kind: 'none'; reason: string }

/** One build per floor per survey, kept for the session, so LiveOps and
 * Missions share it. Keyed by `updated_at` too, so a re-survey under the same
 * id is not served stale. An error is dropped, not kept, so the next mount
 * retries; an `unavailable` (no grid stored) is an answer and stays. */
const cache = new Map<string, Promise<SceneOutcome>>()

export function sceneKey(map: Pick<SiteMap, 'map_id' | 'updated_at'>, floorIndex: number): string {
  return `${map.map_id}@${map.updated_at}/${floorIndex}`
}

export function sceneRequest(map: SiteMap, floorIndex: number): SceneRequest {
  const floor = map.floors.find((f) => f.index === floorIndex)
  if (!floor) return { kind: 'none', reason: `map ${map.map_id} has no floor ${floorIndex}` }
  const url = (kind: 'grid' | 'planning' | 'cloud') => dataProvider.mapArtifactUrl(map.map_id, floorIndex, kind)
  const grid = url('grid')
  // Mock mode stores no files and answers an empty URL; fetch('') would
  // re-request the current page.
  if (!grid) return { kind: 'none', reason: 'no stored map files (mock data)' }
  return { kind: 'fetch', key: sceneKey(map, floorIndex), floor, urls: { grid, planning: url('planning'), cloud: url('cloud') } }
}

/** The file's bytes; null when it answers one of `absent` (the file is
 * optional and not stored). Any other failure throws. */
async function fetchBytes(url: string, absent: readonly number[]): Promise<ArrayBuffer | null> {
  if (!url) return null
  const response = await apiFetch(url)
  if (absent.includes(response.status)) return null
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`)
  return response.arrayBuffer()
}

function pgm(bytes: ArrayBuffer, url: string): GridPixels {
  const grid = parsePgm(new Uint8Array(bytes))
  if (!grid) throw new Error(`${url} is not a P5 grid of the size its header says`)
  return grid
}

async function build(map: SiteMap, req: Extract<SceneRequest, { kind: 'fetch' }>): Promise<SceneOutcome> {
  const { floor, urls } = req
  // Planning answers 404 when the floor has none; cloud 404 when not stored
  // and 413 when the backend refuses one too large to serve.
  const [gridBytes, planningBytes, cloudBytes] = await Promise.all([
    fetchBytes(urls.grid, [404]),
    floor.planning === null ? Promise.resolve(null) : fetchBytes(urls.planning, [404]),
    fetchBytes(urls.cloud, [404, 413]),
  ])
  if (!gridBytes) return { status: 'unavailable', reason: `floor ${floor.index} has no stored grid` }
  let cloud: Float32Array | null = null
  if (cloudBytes) {
    cloud = parseCloudBin(cloudBytes)
    if (!cloud) throw new Error(`${urls.cloud} is ${cloudBytes.byteLength} bytes, not whole x,y,z float32 triples`)
  }
  return {
    status: 'ready',
    data: buildSceneData({
      mapId: map.map_id,
      floorIndex: floor.index,
      floorZ: floor.floor_z_m,
      res: floor.resolution_m,
      origin: [floor.origin_xy_m[0], floor.origin_xy_m[1]],
      structure: pgm(gridBytes, urls.grid),
      planning: planningBytes ? pgm(planningBytes, urls.planning) : null,
      cloud,
    }),
  }
}

/** Load (or reuse) one floor's scene. Never rejects: a failure is an `error`
 * outcome, logged, and not cached. */
export function loadSceneData(map: SiteMap, floorIndex: number): Promise<SceneOutcome> {
  const req = sceneRequest(map, floorIndex)
  if (req.kind === 'none') return Promise.resolve({ status: 'unavailable', reason: req.reason })
  let hit = cache.get(req.key)
  if (!hit) {
    hit = build(map, req).catch((e: unknown): SceneOutcome => {
      console.warn('map scene unavailable; the flat map is used instead', e)
      cache.delete(req.key)
      return { status: 'error', reason: e instanceof Error ? e.message : String(e) }
    })
    cache.set(req.key, hit)
  }
  return hit
}

const IDLE: SceneDataState = Object.freeze({ status: 'idle', data: null })
const LOADING: SceneDataState = Object.freeze({ status: 'loading', data: null })

/**
 * One floor's scene data: the grid bits always, the classified cloud when the
 * map has one. `unavailable` when there is nothing to build from (mock mode, no
 * such floor, no grid stored), `error` when a file could not be fetched or
 * read; either way the caller falls back to the flat map.
 */
export function useSceneData(map: SiteMap | null | undefined, floorIndex: number): SceneDataState {
  const stamp = map ? sceneKey(map, floorIndex) : null
  // `map` is covered by `stamp`: a new object with the same id and time is the same survey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const req = useMemo(() => (map ? sceneRequest(map, floorIndex) : null), [stamp])
  const none = useMemo<SceneDataState | null>(
    () => (req?.kind === 'none' ? { status: 'unavailable', data: null, reason: req.reason } : null), [req])
  const [loaded, setLoaded] = useState<{ stamp: string | null; state: SceneDataState }>({ stamp: null, state: IDLE })

  useEffect(() => {
    if (!map || !stamp || !req || req.kind === 'none') return
    let current = true
    void loadSceneData(map, floorIndex).then((outcome) => {
      if (!current) return
      setLoaded({
        stamp,
        state: outcome.status === 'ready'
          ? { status: 'ready', data: outcome.data }
          : { status: outcome.status, data: null, reason: outcome.reason },
      })
    })
    return () => { current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  if (!req) return IDLE
  if (none) return none
  return loaded.stamp === stamp ? loaded.state : LOADING
}

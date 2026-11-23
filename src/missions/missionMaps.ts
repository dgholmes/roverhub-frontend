import type { MissionLibraryEntry, RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * Which map each mission is on, judged from the site's list of maps
 * (useSiteMapStore.maps) rather than the one map Missions happens to show. A
 * site can hold several (two floors, a car park), and the backend judges a
 * route by its own map (runs/dispatch.py), so the console does too.
 */

/** A mission's map as the library shows it.
 * - `map`: in the site's list;
 * - `none`: a route that names no map, or a program (a program has no map
 *   frame: authoring.ts `applyProgramState`);
 * - `missing`: names a map the site does not have (deleted, or replaced);
 * - `unknown`: the list has not loaded, so "missing" would be a claim. */
export type MissionMapOf =
  | { status: 'map'; map: SiteMap }
  | { status: 'none' }
  | { status: 'missing' }
  | { status: 'unknown' }

export function missionMapOf(mission: Pick<MissionLibraryEntry, 'kind' | 'map_id'>, maps: readonly SiteMap[] | null | undefined): MissionMapOf {
  if (mission.kind === 'program' || !mission.map_id) return { status: 'none' }
  if (!maps) return { status: 'unknown' }
  const map = maps.find((m) => m.map_id === mission.map_id)
  return map ? { status: 'map', map } : { status: 'missing' }
}

// --- The library's map filter ----------------------------------------------

/** `all`, `map:<id>`, `none` or `missing`. Every lost map shares one key: the
 * operator cannot tell one deleted id from another, and needs only to find them. */
export type MapFilterKey = string

export type MapFilterOption =
  | { key: 'all'; kind: 'all' }
  | { key: string; kind: 'map'; name: string }
  | { key: 'none'; kind: 'none' }
  | { key: 'missing'; kind: 'missing' }

export function missionMapKey(mission: Pick<MissionLibraryEntry, 'kind' | 'map_id'>, maps: readonly SiteMap[] | null | undefined): MapFilterKey {
  const of = missionMapOf(mission, maps)
  return of.status === 'map' ? `map:${of.map.map_id}` : of.status
}

/** The map filter's options: All, then each map some mission is on (by name),
 * then "No map" and "Missing map" when a mission is so. Empty -- no filter --
 * unless the missions span two or more of these, or before the list loads. */
export function mapFilterOptions(missions: readonly MissionLibraryEntry[], maps: readonly SiteMap[] | null | undefined): MapFilterOption[] {
  if (!maps) return []
  const keys = new Set(missions.map((m) => missionMapKey(m, maps)))
  if (keys.size < 2) return []
  const named = maps
    .filter((m) => keys.has(`map:${m.map_id}`))
    .sort((a, b) => a.name.localeCompare(b.name) || a.map_id.localeCompare(b.map_id))
    .map((m): MapFilterOption => ({ key: `map:${m.map_id}`, kind: 'map', name: m.name }))
  return [
    { key: 'all', kind: 'all' },
    ...named,
    ...(keys.has('none') ? [{ key: 'none', kind: 'none' } as const] : []),
    ...(keys.has('missing') ? [{ key: 'missing', kind: 'missing' } as const] : []),
  ]
}

export function filterByMap<M extends MissionLibraryEntry>(missions: readonly M[], key: MapFilterKey, maps: readonly SiteMap[] | null | undefined): M[] {
  if (key === 'all') return [...missions]
  return missions.filter((m) => missionMapKey(m, maps) === key)
}

// --- New mission: which map? -----------------------------------------------

/** One row of the New mission chooser. Drafts and archived maps are shown, so
 * the operator sees why the map they expected is not offered, but cannot be
 * chosen: a route can run only on an active map. */
export interface MapChoice {
  map: SiteMap
  /** Names of the site's robots whose bridge reports this map (`nav_map_id`). */
  robots: string[]
  choosable: boolean
  reason: 'draft' | 'archived' | null
}

const STATUS_ORDER: Record<SiteMap['status'], number> = { active: 0, draft: 1, archived: 2 }

export function mapChoices(maps: readonly SiteMap[], robots: readonly RobotState[]): MapChoice[] {
  return [...maps]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name) || a.map_id.localeCompare(b.map_id))
    .map((map) => ({
      map,
      robots: robots.filter((r) => r.bridge?.nav_map_id === map.map_id).map((r) => r.name),
      choosable: map.status === 'active',
      reason: map.status === 'active' ? null : map.status,
    }))
}

/** What New mission does with the site's maps:
 * - `use`: start drawing on `mapId` ('' is the plain grid) without asking;
 * - `ask`: open the chooser, with `defaultMapId` ticked (null: nothing can be).
 *
 * `shown` is the map Missions shows (useSiteMapStore.map: the LiveOps robot's
 * map, else the newest active one). It is the default when it is active. */
export type NewMissionStart = { kind: 'use'; mapId: string } | { kind: 'ask'; defaultMapId: string | null }

export function newMissionStart(maps: readonly SiteMap[] | null | undefined, shown: SiteMap | null | undefined): NewMissionStart {
  // No list (still loading, or failed): today's behaviour, the shown map.
  if (!maps) return { kind: 'use', mapId: shown?.map_id ?? '' }
  if (maps.length === 0) return { kind: 'use', mapId: '' }
  if (maps.length === 1) return { kind: 'use', mapId: maps[0].map_id }
  const shownActive = shown && shown.status === 'active' && maps.some((m) => m.map_id === shown.map_id) ? shown : null
  const newestActive = [...maps].filter((m) => m.status === 'active').sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  return { kind: 'ask', defaultMapId: (shownActive ?? newestActive)?.map_id ?? null }
}

import { create } from 'zustand'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { SiteMap } from '@/types/maps'

/** The map to show for a site: the one the selected robot runs (its bridge's
 * `nav_map_id`, map ready spec §4.10), else the newest active one, else the
 * most recently updated. A site can hold drafts and archived surveys; missions
 * are planned against the active one -- but a robot walks on the map it has
 * loaded, and LiveOps must draw that one under it, not another. */
export function pickSiteMap(maps: SiteMap[], robotNavMapId?: string | null): SiteMap | null {
  const robots = robotNavMapId ? maps.find((m) => m.map_id === robotNavMapId) : undefined
  if (robots) return robots
  const byRecency = [...maps].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return byRecency.find((m) => m.status === 'active') ?? byRecency[0] ?? null
}

interface SiteMapState {
  /** The site `map` was (or is being) loaded for. */
  siteId: string | null
  map: SiteMap | null
  /** Undefined means "the map's first floor". */
  floorIndex: number | undefined
  /** The site's maps as last fetched, so a change of robot picks again
   *  without a fetch. */
  maps: SiteMap[] | null
  /** The map the selected robot runs (`nav_map_id`), preferred by pickSiteMap. */
  robotNavMapId: string | null
  load: (siteId: string) => Promise<void>
  /** Fetch the current site's map again. `load` answers from what it already
   * holds, so a map made, frozen or edited after the first answer -- including
   * "this site has no maps" -- never shows without this. */
  reload: () => Promise<void>
  setFloorIndex: (floorIndex: number) => void
  /** The selected robot's map: LiveOps draws it when the site has it. */
  setRobotNavMapId: (mapId: string | null) => void
}

/** Counts reloads, so only the newest one's answer is applied. */
let reloadSeq = 0

/**
 * The surveyed map LiveOps draws, loaded once per site and shared by every view
 * that shows the map canvas -- four views mount a MapCanvas, and switching
 * between them must not refetch. `map` keeps its identity until the site
 * changes and `setFloorIndex` never changes identity, because MapCanvas
 * re-renders on every telemetry frame and these go to it as props: a fresh
 * object per frame would defeat the memoization of GridLayer and
 * FloorplanLayer (see GridLayer's comment).
 *
 * The floorplan is optional, so a failed fetch shows no map rather than an
 * error, and is retried the next time a view asks.
 *
 * Whoever writes a map (zones, freezing) calls `reload` afterwards. It keeps the
 * map on screen while it fetches, and keeps it if the fetch fails.
 */
export const useSiteMapStore = create<SiteMapState>((set, get) => ({
  siteId: null,
  map: null,
  floorIndex: undefined,
  maps: null,
  robotNavMapId: null,

  load: async (siteId) => {
    if (get().siteId === siteId) return
    set({ siteId, map: null, floorIndex: undefined, maps: null })
    try {
      const maps = await dataProvider.listMaps(siteId)
      // The operator may have switched sites while this was in flight.
      if (get().siteId === siteId) set({ maps, map: pickSiteMap(maps, get().robotNavMapId) })
    } catch (e) {
      console.warn('maps unavailable; drawing no floorplan', e)
      if (get().siteId === siteId) set({ siteId: null })
    }
  },

  reload: async () => {
    const siteId = get().siteId
    if (siteId === null) return
    // Focus, a tab coming back, a poll and a save can overlap: only the newest
    // fetch's answer is shown, so an older one landing late cannot undo it.
    const seq = ++reloadSeq
    try {
      const maps = await dataProvider.listMaps(siteId)
      if (get().siteId !== siteId || seq !== reloadSeq) return
      const fresh = pickSiteMap(maps, get().robotNavMapId)
      // Unchanged: keep the object, so a refresh that finds nothing new does
      // not re-render MapCanvas's memoized layers.
      const current = get().map
      const map = current && fresh && JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh
      // A re-survey can have fewer floors than the one the operator was on.
      const { floorIndex } = get()
      const keepFloor = floorIndex !== undefined && map !== null && map.floors.some((f) => f.index === floorIndex)
      set({ maps, map, floorIndex: keepFloor ? floorIndex : undefined })
    } catch (e) {
      console.warn('maps could not be refreshed; keeping what is shown', e)
    }
  },

  setFloorIndex: (floorIndex) => set({ floorIndex }),

  setRobotNavMapId: (robotNavMapId) => {
    if (get().robotNavMapId === robotNavMapId) return
    const { maps, map } = get()
    const picked = maps ? pickSiteMap(maps, robotNavMapId) : map
    // Another map: its floors are not the old one's. The same map keeps its
    // object and floor, so MapCanvas's layers are not rebuilt.
    if (picked?.map_id === map?.map_id) set({ robotNavMapId })
    else set({ robotNavMapId, map: picked, floorIndex: undefined })
  },
}))

/** Where Missions › Maps tells other tabs of this browser that a map changed. */
const MAPS_CHANNEL = 'rh.maps'

/** How often an open LiveOps asks whether the map changed, while it is shown:
 * the fallback for an edit made on another computer. */
export const MAP_REFRESH_MS = 60_000

/**
 * After writing a map (zones, freezing, a restore, an edit in the map editor):
 * fetch it again here, and tell this browser's other tabs to do the same, so a
 * LiveOps already open beside Missions › Maps shows the edit without a reload.
 */
export function mapsChanged(): Promise<void> {
  try {
    const channel = new BroadcastChannel(MAPS_CHANNEL)
    channel.postMessage('changed')
    channel.close()
  } catch { /* no BroadcastChannel: the other tabs catch up on focus or the poll */ }
  return useSiteMapStore.getState().reload()
}

let watchers = 0
let unwatch: (() => void) | null = null

/**
 * Keep the shown map current while a view that draws it is mounted: fetch it
 * again when another tab says a map changed, when this tab is shown or
 * focused again, and every `pollMs` while it is visible (an edit made on
 * another computer has no other way here). Counted, so several views share
 * one set of listeners. Returns the view's unsubscribe.
 */
export function watchSiteMap(pollMs: number = MAP_REFRESH_MS): () => void {
  watchers++
  if (watchers === 1) unwatch = startWatching(pollMs)
  let done = false
  return () => {
    if (done) return
    done = true
    watchers--
    if (watchers === 0) { unwatch?.(); unwatch = null }
  }
}

function startWatching(pollMs: number): () => void {
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  const refresh = () => { if (visible()) void useSiteMapStore.getState().reload() }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(MAPS_CHANNEL)
    channel.onmessage = refresh
  } catch { channel = null }
  const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', refresh)
  const timer = pollMs > 0 ? window.setInterval(refresh, pollMs) : undefined
  return () => {
    channel?.close()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', refresh)
    if (timer !== undefined) window.clearInterval(timer)
  }
}

import { create } from 'zustand'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { SiteMap } from '@/types/maps'

/** The map to show for a site: the active one, else the most recently updated.
 * A site can hold drafts and archived surveys; missions are planned against the
 * active one, so that is what the console draws. */
export function pickSiteMap(maps: SiteMap[]): SiteMap | null {
  const byRecency = [...maps].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return byRecency.find((m) => m.status === 'active') ?? byRecency[0] ?? null
}

interface SiteMapState {
  /** The site `map` was (or is being) loaded for. */
  siteId: string | null
  map: SiteMap | null
  /** Whether the maps have answered for `siteId`. `map === null` alone cannot
   * tell "this site has no map" from "the answer has not come yet"; a failed
   * fetch is not an answer either. */
  loaded: boolean
  /** Undefined means "the map's first floor". */
  floorIndex: number | undefined
  load: (siteId: string) => Promise<void>
  /** Fetch the current site's map again. `load` answers from what it already
   * holds, so a map made, frozen or edited after the first answer -- including
   * "this site has no maps" -- never shows without this. */
  reload: () => Promise<void>
  setFloorIndex: (floorIndex: number) => void
}

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
  loaded: false,
  floorIndex: undefined,

  load: async (siteId) => {
    if (get().siteId === siteId) return
    set({ siteId, map: null, loaded: false, floorIndex: undefined })
    try {
      const map = pickSiteMap(await dataProvider.listMaps(siteId))
      // The operator may have switched sites while this was in flight.
      if (get().siteId === siteId) set({ map, loaded: true })
    } catch (e) {
      console.warn('maps unavailable; drawing no floorplan', e)
      if (get().siteId === siteId) set({ siteId: null })
    }
  },

  reload: async () => {
    const siteId = get().siteId
    if (siteId === null) return
    try {
      const map = pickSiteMap(await dataProvider.listMaps(siteId))
      if (get().siteId !== siteId) return
      // A re-survey can have fewer floors than the one the operator was on.
      const { floorIndex } = get()
      const keepFloor = floorIndex !== undefined && map !== null && map.floors.some((f) => f.index === floorIndex)
      set({ map, floorIndex: keepFloor ? floorIndex : undefined })
    } catch (e) {
      console.warn('maps could not be refreshed; keeping what is shown', e)
    }
  },

  setFloorIndex: (floorIndex) => set({ floorIndex }),
}))

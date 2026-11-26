import { useEffect } from 'react'
import { create } from 'zustand'
import type { SiteMap } from '@/types/maps'

/**
 * Every site's maps as the Organization pages and Fleet's Map row show them
 * (GET /maps?site_id=, `dataProvider.listMaps`). LiveOps has its own map store
 * (store/useSiteMapStore.ts) for the one site it is on; the org pages show
 * many sites at once, so they keep a small cache of their own here.
 *
 * An answer is reused for `FRESH_MS`, so moving between Dashboard, Sites and
 * Fleet does not refetch every time, and is fetched again after that the next
 * time a page asks. A failed fetch keeps the last list and says so.
 */

export const FRESH_MS = 60_000

export interface SiteMapsEntry {
  /** null until the first answer. */
  maps: SiteMap[] | null
  loading: boolean
  error: string | null
  /** When the last answer arrived (ms), 0 for never. */
  at: number
}

const EMPTY: SiteMapsEntry = { maps: null, loading: false, error: null, at: 0 }

interface SiteMapsState {
  bySite: Record<string, SiteMapsEntry>
  /** Fetch `siteId`'s maps unless a fresh answer or a fetch is on hand. */
  ensure: (siteId: string, now?: number) => Promise<void>
  /** Fetch again whatever is held. */
  reload: (siteId: string) => Promise<void>
}

/** Imported on first use, once, so the org pages' modules do not build the
 * provider by import. */
let providerModule: Promise<typeof import('@/lib/realtime/dataProvider')> | null = null
async function listMaps(siteId: string): Promise<SiteMap[]> {
  providerModule ??= import('@/lib/realtime/dataProvider')
  return (await providerModule).dataProvider.listMaps(siteId)
}

export const useSiteMapsStore = create<SiteMapsState>((set, get) => {
  const patch = (siteId: string, p: Partial<SiteMapsEntry>) =>
    set((s) => ({ bySite: { ...s.bySite, [siteId]: { ...(s.bySite[siteId] ?? EMPTY), ...p } } }))
  const fetchFor = async (siteId: string) => {
    patch(siteId, { loading: true })
    try {
      const maps = await listMaps(siteId)
      patch(siteId, { maps, loading: false, error: null, at: Date.now() })
    } catch (e) {
      patch(siteId, { loading: false, error: e instanceof Error ? e.message : String(e), at: Date.now() })
    }
  }
  return {
    bySite: {},
    ensure: async (siteId, now = Date.now()) => {
      const e = get().bySite[siteId]
      if (e?.loading) return
      if (e && e.at > 0 && now - e.at < FRESH_MS) return
      await fetchFor(siteId)
    },
    reload: (siteId) => fetchFor(siteId),
  }
})

/** One site's maps, fetched on first use. */
export function useSiteMaps(siteId: string | null | undefined): SiteMapsEntry {
  const entry = useSiteMapsStore((s) => (siteId ? s.bySite[siteId] : undefined))
  const ensure = useSiteMapsStore((s) => s.ensure)
  useEffect(() => { if (siteId) void ensure(siteId) }, [siteId, ensure])
  return entry ?? EMPTY
}

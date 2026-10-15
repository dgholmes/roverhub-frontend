import { create } from 'zustand'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { MissionLibraryEntry } from '@/types'

/**
 * The site's saved missions. Loaded through the data provider: the backend's
 * /missions in real mode, this browser's storage in mock mode. Editors work
 * on a copy and call `save`; nothing here is a draft.
 */
interface MissionStore {
  siteId: string | null
  missions: MissionLibraryEntry[]
  loading: boolean
  /** Set when the library couldn't be loaded, e.g. a backend without /missions. */
  error: string | null
  load: (siteId: string) => Promise<void>
  save: (mission: MissionLibraryEntry) => Promise<MissionLibraryEntry>
  remove: (missionId: string) => Promise<void>
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  siteId: null,
  missions: [],
  loading: false,
  error: null,
  load: async (siteId) => {
    set({ siteId, loading: true, error: null, missions: get().siteId === siteId ? get().missions : [] })
    try {
      const missions = await dataProvider.listMissions(siteId)
      if (get().siteId === siteId) set({ missions, loading: false })
    } catch (e) {
      if (get().siteId === siteId) set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  save: async (mission) => {
    const stored = await dataProvider.saveMission(mission)
    set((s) => ({
      missions: s.missions.some((m) => m.mission_id === stored.mission_id)
        ? s.missions.map((m) => (m.mission_id === stored.mission_id ? stored : m))
        : [stored, ...s.missions],
    }))
    return stored
  },
  remove: async (missionId) => {
    await dataProvider.deleteMission(missionId)
    set((s) => ({ missions: s.missions.filter((m) => m.mission_id !== missionId) }))
  },
}))

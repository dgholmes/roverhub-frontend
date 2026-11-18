import { useEffect } from 'react'
import { useSessionStore } from '@/store/useSessionStore'
import { useSiteMapStore, watchSiteMap } from '@/store/useSiteMapStore'

/** The props that put the active site's surveyed floorplan on a MapCanvas:
 * spread them into the full-variant views. Every value is referentially stable
 * between telemetry frames (see useSiteMapStore).
 *
 * While mounted the map is kept current (watchSiteMap): an edit saved in
 * Missions › Maps -- in another tab, or on another computer -- reaches an open
 * LiveOps without a reload. A changed map has a new `updated_at`, which is
 * what the floor's scene and walkable area are cached by, so both are read
 * again. */
export function useSiteMap() {
  const siteId = useSessionStore((s) => s.activeSiteId)
  const map = useSiteMapStore((s) => s.map)
  const floorIndex = useSiteMapStore((s) => s.floorIndex)
  const onFloorChange = useSiteMapStore((s) => s.setFloorIndex)
  const load = useSiteMapStore((s) => s.load)
  useEffect(() => { void load(siteId) }, [load, siteId])
  useEffect(() => watchSiteMap(), [])
  return { map: map ?? undefined, floorIndex, onFloorChange }
}

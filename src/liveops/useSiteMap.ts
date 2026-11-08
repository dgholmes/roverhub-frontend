import { useEffect } from 'react'
import { useSessionStore } from '@/store/useSessionStore'
import { useSiteMapStore } from '@/store/useSiteMapStore'

/** The props that put the active site's surveyed floorplan on a MapCanvas:
 * spread them into the full-variant views. Every value is referentially stable
 * between telemetry frames (see useSiteMapStore). */
export function useSiteMap() {
  const siteId = useSessionStore((s) => s.activeSiteId)
  const map = useSiteMapStore((s) => s.map)
  const floorIndex = useSiteMapStore((s) => s.floorIndex)
  const onFloorChange = useSiteMapStore((s) => s.setFloorIndex)
  const load = useSiteMapStore((s) => s.load)
  useEffect(() => { void load(siteId) }, [load, siteId])
  return { map: map ?? undefined, floorIndex, onFloorChange }
}

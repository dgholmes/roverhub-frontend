import { useEffect } from 'react'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useSiteMapStore, watchSiteMap } from '@/store/useSiteMapStore'

/** The props that put the active site's surveyed floorplan on a MapCanvas:
 * spread them into the full-variant views. Every value is referentially stable
 * between telemetry frames (see useSiteMapStore).
 *
 * While mounted the map is kept current (watchSiteMap): an edit saved in
 * the Map workspace -- in another tab, or on another computer -- reaches an open
 * LiveOps without a reload. A changed map has a new `updated_at`, which is
 * what the floor's scene and walkable area are cached by, so both are read
 * again.
 *
 * The map drawn is the one the selected robot runs, when the site has it
 * (map ready spec §4.10): a robot set up for another map than the active one
 * walks on that one, and drawing the active map under it would place it on
 * the wrong floorplan. */
export function useSiteMap() {
  const siteId = useSessionStore((s) => s.activeSiteId)
  const map = useSiteMapStore((s) => s.map)
  const floorIndex = useSiteMapStore((s) => s.floorIndex)
  const onFloorChange = useSiteMapStore((s) => s.setFloorIndex)
  const load = useSiteMapStore((s) => s.load)
  const selectedId = useSessionStore((s) => s.selectedRobotId)
  const navMapId = useLiveOpsStore((s) => s.robots.find((r) => r.robot_id === selectedId)?.bridge?.nav_map_id ?? null)
  const setRobotNavMapId = useSiteMapStore((s) => s.setRobotNavMapId)
  // Before load, so the first pick already prefers the robot's map.
  useEffect(() => { setRobotNavMapId(navMapId) }, [setRobotNavMapId, navMapId])
  useEffect(() => { void load(siteId) }, [load, siteId])
  useEffect(() => watchSiteMap(), [])
  return { map: map ?? undefined, floorIndex, onFloorChange }
}

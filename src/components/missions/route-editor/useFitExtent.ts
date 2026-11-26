import { useMemo } from 'react'
import type L from 'leaflet'
import { contentBoundsM } from '@/liveops/contentBounds'
import { useSceneData } from '@/scene3d/useSceneData'
import type { SiteMap } from '@/types/maps'

/**
 * The extent a route map should frame: where the floor was surveyed once its
 * grid is read, else the whole grid (`gridBounds`) as before.
 *
 * ⚠️ The grid's rectangle is not where the building is. FAST-LIO2 sizes it from
 * the whole cloud, so on the active map 71% of it is empty and all of that lies
 * to one side; fitting to it drew the building small against the pane's edge
 * (operator, 2026-11-26, the mission library preview). See liveops/contentBounds.ts.
 *
 * `fitKeySuffix` changes when the surveyed extent arrives, so FitToRoute fits
 * again once, before the operator has touched the view. The read is the one
 * FloorplanLayer already makes (cached per map version and floor).
 */
export function useFitExtent(
  map: SiteMap | undefined, floorIndex: number | undefined, gridBounds: L.LatLngBoundsLiteral | undefined,
): { extent: L.LatLngBoundsLiteral | undefined; fitKeySuffix: string } {
  const scene = useSceneData(map, floorIndex ?? 0)
  const grid = scene.status === 'ready' && floorIndex !== undefined ? scene.data?.grid ?? null : null
  const content = useMemo(() => (grid ? contentBoundsM(grid) : null), [grid])
  return { extent: content ?? gridBounds, fitKeySuffix: content ? 'surveyed' : 'grid' }
}

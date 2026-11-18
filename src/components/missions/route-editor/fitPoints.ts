import { toLatLng } from '@/liveops/mapCoords'
import type { MissionWaypoint } from '@/types'

/** A [lat, lng] pair, which for this app's Simple CRS is [y_m, x_m]. */
export type FitPoint = [number, number]

/**
 * Everything a fit should include: the surveyed extent when there is one, plus
 * every waypoint. Empty when there is neither, in which case the caller leaves
 * the view where it was.
 *
 * ⚠️ There is deliberately no fallback. `routeBounds` used to substitute the
 * mock site's perimeter whenever `extent` was undefined — which is every
 * RoutePreviewMap, and the editor on any mission with no surveyed map. The
 * route then sat small in the middle of a view padded out to a boundary
 * belonging to nowhere, and nothing distinguished that empty space from real
 * site. Fit what exists. Audit 2026-11-18 §8.6.
 *
 * Separate from FitToRoute so it is testable: that module imports Leaflet for
 * real, and Leaflet wants a window.
 */
export function fitPoints(
  waypoints: readonly MissionWaypoint[],
  extent?: readonly FitPoint[],
): FitPoint[] {
  return [
    ...(extent ?? []),
    ...waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m) as FitPoint),
  ]
}

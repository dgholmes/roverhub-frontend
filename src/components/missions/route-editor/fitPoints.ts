import { toLatLng } from '@/liveops/mapCoords'
import type { MissionWaypoint } from '@/types'
import type { MapZone } from '@/types/maps'

/** A [lat, lng] pair, which for this app's Simple CRS is [y_m, x_m]. */
export type FitPoint = [number, number]

/**
 * Everything a fit should include: the surveyed extent when there is one,
 * else the boundary that is drawn, plus every waypoint. Empty when there is
 * none of those, and the caller then leaves the view where it was.
 *
 * `zones` are the ones the caller draws -- a survey's, or the provider's
 * sample site, which is the demo perimeter in mock mode and nothing on the
 * real backend. Only their `geofence` ones count; a no-go zone is not where
 * the site ends.
 *
 * ⚠️ This used to fall back to the mock perimeter imported from src/mocks,
 * whatever the canvas drew. On the real backend that framed every route
 * preview against a boundary the canvas does not show, at coordinates
 * belonging to nowhere. Fit what is drawn. Audit 2026-11-18 §8.6.
 *
 * Separate from FitToRoute so it is testable: that module imports Leaflet for
 * real, and Leaflet wants a window.
 */
export function fitPoints(
  waypoints: readonly MissionWaypoint[],
  extent?: readonly FitPoint[],
  zones?: readonly MapZone[],
): FitPoint[] {
  const drawnFence = (zones ?? []).filter((z) => z.kind === 'geofence')
    .flatMap((z) => z.polygon.map(([x, y]) => toLatLng(x, y) as FitPoint))
  return [
    ...(extent ?? drawnFence),
    ...waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m) as FitPoint),
  ]
}

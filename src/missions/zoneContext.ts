import { geofence as mockGeofence, noGoZones as mockNoGoZones } from '@/mocks/mockGeoZones'
import type { SiteMap } from '@/types/maps'
import type { CheckContext } from './validate'

/**
 * The zones a mission is checked against: the loaded map's own, which are the
 * ones the canvas draws, so a mission is never flagged against zones nothing
 * shows. A map with no zones checks against none; only with no map at all (an
 * unsurveyed site, or mock mode) does it fall back to the mock site's, as the
 * canvas does.
 */
export function zoneContext(map: Pick<SiteMap, 'zones'> | null | undefined): Pick<CheckContext, 'noGoZones' | 'geofences'> {
  if (!map) return { noGoZones: mockNoGoZones, geofences: [mockGeofence] }
  const points = (polygon: [number, number][]) => polygon.map(([x_m, y_m]) => ({ x_m, y_m }))
  return {
    noGoZones: map.zones.filter((z) => z.kind === 'no_go').map((z) => ({ id: z.zone_id, label: z.label, points: points(z.polygon) })),
    geofences: map.zones.filter((z) => z.kind === 'geofence').map((z) => points(z.polygon)),
  }
}

import type { SiteMap } from '@/types/maps'

/** A stand-in for a floor's content_hash (64 hex, shared/schemas/map_hash.py's
 *  pattern): the same seed always gives the same hash. The real one hashes
 *  the floor's files; the mock only needs a new value whenever they change. */
export function mockContentHash(seed: string): string {
  let out = ''
  for (let part = 0; part < 8; part++) {
    let h = 0x811c9dc5
    for (const ch of `${seed}#${part}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out
}

/** The Venue survey's floor 0 as Missions › Maps shows it, and the older
 *  version some mock robots still run on (so "Robot maps" shows a robot that
 *  differs, and Send to robot can be tried). */
export const MOCK_VENUE_HASH = mockContentHash('map-venue-survey/0/v2')
export const MOCK_VENUE_OLD_HASH = mockContentHash('map-venue-survey/0/v1')

/** One map modelled on the real 2026-11-06 venue survey, and deliberately a
 * poor one: 2.4% of cells free and 13.9% surveyed at all, so the console's
 * "n% surveyed" warning can be reached by hand in mock mode. A rosy mock would
 * leave that path untested. The cell counts sum to 400 x 480 = 192,000. */
export const mockMaps: SiteMap[] = [
  {
    map_id: 'map-venue-survey',
    site_id: 'site-north-yard',
    name: 'Venue survey',
    source: 'slam',
    // origin + size_cells * resolution_m: [-5.4753 + 20, -17.8671 + 24]
    extent_min: [-5.4753, -17.8671],
    extent_max: [14.5247, 6.1329],
    created_at: '2026-11-06T09:30:00Z',
    updated_at: '2026-11-06T09:30:00Z',
    geodetic_anchor: null,
    status: 'active',
    zones: [],
    floors: [{
      index: 0,
      label: null,
      floor_z_m: -0.34,
      resolution_m: 0.05,
      origin_xy_m: [-5.4753, -17.8671],
      size_cells: [400, 480],
      free_cells: 1800,
      occupied_cells: 24900,
      unknown_cells: 165300,
      content_hash: MOCK_VENUE_HASH,
    }],
  },
]

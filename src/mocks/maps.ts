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

/** The Venue survey's floor 0 as the Map workspace shows it, and the older
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
  // A second active map on the same site, so New mission's "which map?",
  // the library's map chips and its map filter can be seen in mock mode. Older
  // than the venue, so the venue stays the map Missions and LiveOps show. No
  // robot is set up for it, and it has no survey files (mock maps have none).
  {
    map_id: 'map-car-park',
    site_id: 'site-north-yard',
    name: 'Car park B1',
    source: 'slam',
    // origin + size_cells * resolution_m: [30 + 16, -10 + 12]
    extent_min: [30, -10],
    extent_max: [46, 2],
    created_at: '2026-11-02T08:00:00Z',
    updated_at: '2026-11-02T08:00:00Z',
    geodetic_anchor: null,
    status: 'active',
    zones: [],
    zones_reviewed_at: '2026-11-02T08:10:00Z',
    zones_reviewed_by: 'MinJae Joo',
    floors: [{
      index: 0,
      label: 'B1',
      floor_z_m: 0,
      resolution_m: 0.05,
      origin_xy_m: [30, -10],
      size_cells: [320, 240],
      free_cells: 30720,
      occupied_cells: 7680,
      unknown_cells: 38400,
      content_hash: mockContentHash('map-car-park/0/v1'),
    }],
  },
]

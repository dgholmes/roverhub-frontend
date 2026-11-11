import type { SiteMap } from '@/types/maps'

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
    }],
  },
]

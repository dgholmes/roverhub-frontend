import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import type { MapZone, SiteMap } from '@/types/maps'
import { mapZonesFor, zonesFor } from './zoneContext'

// The drawing half of the rule zoneContext enforces for checking.
//
// Found after the first fix landed, by a second reader: the zone LAYERS fell
// back to the mock site whenever `zones` was undefined, and three callers
// passed nothing at all -- unconditionally, with no map-dependent branch to
// reach. So Data > Missions drew the demo site's no-go polygons and geofence
// underneath a real mission's executed waypoints, and the snapshot map placed
// real captures against the same fiction.
//
// That is worse than checking a mission against mock zones. It is a page whose
// whole job is to record what happened, drawing safety geometry that never
// existed, with nothing to tell an operator those polygons are not exclusion
// zones the robot was respecting. PRD DAT-003 asks replay to label anything
// inferred or reconstructed; this was the exact opposite.
//
// Audit 2026-11-18 §4.2 / §8.6.

const venue: SiteMap = mockMaps[0]
const noGo: MapZone = {
  zone_id: 'z-1', map_id: venue.map_id, kind: 'no_go', label: 'Stairwell',
  polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
}
const map: SiteMap = { ...venue, zones: [noGo] }

describe('mapZonesFor: what a mission may draw', () => {
  it('draws the zones of the map the mission was planned on', () => {
    expect(mapZonesFor(venue.map_id, map)).toEqual([noGo])
  })

  it('draws nothing for a mission planned on some other map', () => {
    expect(mapZonesFor('map-older', map)).toEqual([])
  })

  it('draws nothing when that map is not loaded', () => {
    expect(mapZonesFor(venue.map_id, undefined)).toEqual([])
  })

  it('draws nothing for a mission that names no map', () => {
    expect(mapZonesFor('', map)).toEqual([])
  })

  it('agrees with what the checks use', () => {
    // The canvas and the verdict must never disagree about which geometry is
    // in play. That disagreement is how a green "Ready" gets believed.
    expect(mapZonesFor('map-older', map)).toEqual([])
    expect(zonesFor('map-older', map).noGoZones).toEqual([])
  })
})

describe('the zone layers', () => {
  const sourceOf = (name: string) => readFileSync(
    fileURLToPath(new URL(`../components/liveops/map/${name}.tsx`, import.meta.url)),
    'utf8',
  )

  it.each(['NoGoZoneLayer', 'GeofenceLayer'])(
    '%s has no path to the mock site at all',
    (layer) => {
      expect(sourceOf(layer)).not.toMatch(/from\s+['"]@\/mocks/)
    },
  )

  it.each(['NoGoZoneLayer', 'GeofenceLayer'])(
    '%s requires its zones rather than defaulting to something',
    (layer) => {
      // An optional `zones` is what let three callers omit it silently. The
      // type checker is the only thing that can catch the fourth.
      expect(sourceOf(layer)).toMatch(/zones:\s*readonly MapZone\[\]/)
      expect(sourceOf(layer)).not.toMatch(/zones\?:/)
    },
  )
})

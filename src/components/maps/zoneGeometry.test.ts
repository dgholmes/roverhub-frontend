import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import type { MapZone, Point2D, SiteMap } from '@/types/maps'
import {
  activationProblem, addVertex, buildZone, closePolygon, defaultLabel, latLngToMapMetres,
  nextZoneId, polygonProblem, zoneOutOfBounds,
} from './zoneGeometry'

const venue = mockMaps[0]

const zone = (over: Partial<MapZone> = {}): MapZone => ({
  zone_id: 'zone-1', map_id: venue.map_id, kind: 'no_go', label: 'Stairwell',
  polygon: [[0, 0], [1, 0], [1, 1]], ...over,
})

describe('latLngToMapMetres', () => {
  it('converts a Leaflet latlng to map metres as [x, y], not [y, x]', () => {
    // CRS.Simple: lat is y, lng is x (see toLatLng in liveops/mapCoords).
    expect(latLngToMapMetres({ lat: 2, lng: 5 })).toEqual([5, 2])
  })

  it('rounds to a millimetre, shedding the float noise of a pixel-to-metre conversion', () => {
    expect(latLngToMapMetres({ lat: 1.23456789, lng: -7.65432109 })).toEqual([-7.654, 1.235])
  })

  it('agrees with the layers: toLatLng then back is the identity', async () => {
    const { toLatLng } = await import('@/liveops/mapCoords')
    const [lat, lng] = toLatLng(-5.4753, 6.1329) as [number, number]
    expect(latLngToMapMetres({ lat, lng })).toEqual([-5.475, 6.133])
  })
})

describe('addVertex', () => {
  it('adds one vertex per click, in order, without touching the old list', () => {
    const one: Point2D[] = [[0, 0]]
    const two = addVertex(one, [1, 0])
    expect(two).toEqual([[0, 0], [1, 0]])
    expect(one).toEqual([[0, 0]])
  })

  it('ignores a point that is not a finite number', () => {
    expect(addVertex([[0, 0]], [NaN, 1])).toEqual([[0, 0]])
    expect(addVertex([[0, 0]], [1, Infinity])).toEqual([[0, 0]])
  })
})

describe('closePolygon', () => {
  it('closes three vertices as they are, without repeating the first', () => {
    expect(closePolygon([[0, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [1, 0], [1, 1]])
  })

  it('drops the repeat a double-click leaves: two clicks on the same spot, then dblclick', () => {
    expect(closePolygon([[0, 0], [1, 0], [1, 1], [1, 1]])).toEqual([[0, 0], [1, 0], [1, 1]])
    expect(closePolygon([[0, 0], [1, 0], [1, 1], [1.004, 1.004]])).toEqual([[0, 0], [1, 0], [1, 1]])
  })

  it('drops a last vertex that is the first, for an operator who clicks back on the start', () => {
    expect(closePolygon([[0, 0], [1, 0], [1, 1], [0, 0]])).toEqual([[0, 0], [1, 0], [1, 1]])
  })

  it('refuses a polygon with fewer than three vertices, as MapZone does', () => {
    expect(closePolygon([])).toBeNull()
    expect(closePolygon([[0, 0]])).toBeNull()
    expect(closePolygon([[0, 0], [1, 1]])).toBeNull()
    // Three clicks, but two of them are one vertex.
    expect(closePolygon([[0, 0], [1, 1], [1, 1]])).toBeNull()
  })
})

describe('polygonProblem', () => {
  it('accepts a simple polygon', () => {
    expect(polygonProblem([[0, 0], [4, 0], [4, 3], [0, 3]])).toBeNull()
    expect(polygonProblem([[0, 0], [1, 0], [1, 1]])).toBeNull()
  })

  it('names too few vertices', () => {
    expect(polygonProblem([[0, 0], [1, 0]])).toBe('tooFewVertices')
  })

  it('names a polygon with no area: its vertices in a line', () => {
    expect(polygonProblem([[0, 0], [1, 0], [2, 0]])).toBe('noArea')
  })

  it('names a polygon whose edges cross, which is a bow-tie and not a region', () => {
    expect(polygonProblem([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe('selfIntersecting')
  })

  it('does not call a concave polygon self-intersecting', () => {
    expect(polygonProblem([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]])).toBeNull()
  })
})

describe('zoneOutOfBounds', () => {
  // venue extent: x -5.4753..14.5247, y -17.8671..6.1329
  it('is false for a zone wholly inside the extent', () => {
    expect(zoneOutOfBounds(zone(), venue)).toBe(false)
  })

  it('is true when one vertex falls outside, in x or in y', () => {
    expect(zoneOutOfBounds(zone({ polygon: [[0, 0], [1, 0], [15, 1]] }), venue)).toBe(true)
    expect(zoneOutOfBounds(zone({ polygon: [[0, 0], [1, 0], [1, -18]] }), venue)).toBe(true)
    expect(zoneOutOfBounds(zone({ polygon: [[-6, 0], [1, 0], [1, 1]] }), venue)).toBe(true)
  })

  it('is true for a zone wholly outside, as after a re-survey moved the frame', () => {
    expect(zoneOutOfBounds(zone({ polygon: [[100, 100], [101, 100], [101, 101]] }), venue)).toBe(true)
  })

  it('counts the extent edge as inside', () => {
    expect(zoneOutOfBounds(zone({ polygon: [[-5.4753, -17.8671], [14.5247, -17.8671], [14.5247, 6.1329]] }), venue)).toBe(false)
  })
})

describe('activationProblem', () => {
  it('refuses to activate a map with no floors', () => {
    expect(activationProblem({ ...venue, floors: [] })).toBe('noFloors')
  })

  it('allows a draft with a floor', () => {
    expect(activationProblem({ ...venue, status: 'draft' })).toBeNull()
  })

  it('says a map that is already active needs nothing', () => {
    expect(activationProblem({ ...venue, status: 'active' })).toBe('alreadyActive')
  })

  it('checks floors before status, so an empty active map is still reported as empty', () => {
    expect(activationProblem({ ...venue, floors: [], status: 'active' } as SiteMap)).toBe('noFloors')
  })
})

describe('nextZoneId and defaultLabel', () => {
  it('numbers from one, and past the highest in use', () => {
    expect(nextZoneId([])).toBe('zone-1')
    expect(nextZoneId([zone({ zone_id: 'zone-1' }), zone({ zone_id: 'zone-4' })])).toBe('zone-5')
  })

  it('never reuses an id after a delete leaves a gap', () => {
    expect(nextZoneId([zone({ zone_id: 'zone-2' })])).toBe('zone-3')
  })

  it('ignores ids it did not mint', () => {
    expect(nextZoneId([zone({ zone_id: 'ngz-1' })])).toBe('zone-1')
  })

  it('names a zone by kind and count of its kind', () => {
    expect(defaultLabel('no_go', [])).toBe('No-go 1')
    expect(defaultLabel('geofence', [zone({ kind: 'no_go' })])).toBe('Geofence 1')
    expect(defaultLabel('no_go', [zone({ kind: 'no_go' })])).toBe('No-go 2')
  })
})

describe('buildZone', () => {
  const args = { mapId: venue.map_id, kind: 'no_go' as const, label: '  Stairwell ', existing: [] as MapZone[] }

  it('builds a zone from a closed shape, with a trimmed label and a fresh id', () => {
    const built = buildZone({ ...args, points: [[0, 0], [1, 0], [1, 1], [1, 1]] })
    expect(built).toEqual({ zone: {
      zone_id: 'zone-1', map_id: venue.map_id, kind: 'no_go', label: 'Stairwell',
      polygon: [[0, 0], [1, 0], [1, 1]],
    } })
  })

  it('falls back to a default label when none is typed', () => {
    const built = buildZone({ ...args, label: '   ', points: [[0, 0], [1, 0], [1, 1]] })
    expect('zone' in built && built.zone.label).toBe('No-go 1')
  })

  it('reports the problem rather than a zone', () => {
    expect(buildZone({ ...args, points: [[0, 0], [1, 1]] })).toEqual({ problem: 'tooFewVertices' })
    expect(buildZone({ ...args, points: [[0, 0], [1, 0], [2, 0]] })).toEqual({ problem: 'noArea' })
    expect(buildZone({ ...args, points: [[0, 0], [1, 1], [1, 0], [0, 1]] })).toEqual({ problem: 'selfIntersecting' })
  })
})

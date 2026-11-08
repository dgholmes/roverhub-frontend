import { describe, expect, it } from 'vitest'
import '@/i18n'
import { fromLatLng, toLatLng } from '@/liveops/mapCoords'
import { mockMaps } from '@/mocks/maps'
import { noGoZones as mockNoGo } from '@/mocks/mockGeoZones'
import type { MissionLibraryEntry, MissionWaypoint } from '@/types'
import type { MapFloor, MapZone, SiteMap } from '@/types/maps'
import { cellAt, floorOfWaypoint, parsePgm, waypointCells, type GridPixels } from './floorCells'
import { checkAgainstLoadedMap, zoneContext, zonesFor } from './zoneContext'
import { validateMission } from './validate'

// A 4 x 3 grid on a 0.5 m pitch whose lower-left corner is at (-1, -2) metres,
// so it covers x in [-1, 1) and y in [-2, -0.5). PGM row 0 is the TOP of the
// image (max y), as Nav2 writes it: reading the rows top to bottom, the
// occupied cell is top-right, one free cell is second-from-left in the middle
// row, and the other is bottom-left.
const FREE = 254, OCC = 0, UNK = 205
const floor: Pick<MapFloor, 'origin_xy_m' | 'resolution_m'> = { origin_xy_m: [-1, -2], resolution_m: 0.5 }
const grid: GridPixels = {
  width: 4, height: 3,
  pixels: new Uint8Array([
    UNK, UNK, UNK, OCC,   // y in [-1, -0.5)
    UNK, FREE, UNK, UNK,  // y in [-1.5, -1)
    FREE, UNK, UNK, UNK,  // y in [-2, -1.5)
  ]),
}

describe('fromLatLng', () => {
  it('is the inverse of toLatLng: Leaflet is [y, x] and metres map 1:1', () => {
    expect(fromLatLng({ lat: -4, lng: 2 })).toEqual({ x_m: 2, y_m: -4 })
    const [lat, lng] = toLatLng(7.5, -3.25) as [number, number]
    expect(fromLatLng({ lat, lng })).toEqual({ x_m: 7.5, y_m: -3.25 })
  })
})

describe('parsePgm', () => {
  const bytes = (header: string, body: number[]) =>
    new Uint8Array([...new TextEncoder().encode(header), ...body])

  it('reads a P5 header and its pixels', () => {
    const g = parsePgm(bytes('P5\n2 2\n255\n', [1, 2, 3, 4]))
    expect(g).toEqual({ width: 2, height: 2, pixels: new Uint8Array([1, 2, 3, 4]) })
  })

  it('skips comment lines and tolerates the whitespace the format allows', () => {
    const g = parsePgm(bytes('P5\n# written by nav2\n2   1 # size\n255 ', [9, 8]))
    expect(g).toEqual({ width: 2, height: 1, pixels: new Uint8Array([9, 8]) })
  })

  it('does not mistake a pixel that looks like whitespace or a comment for header', () => {
    // 10 is a newline and 35 is "#": both are valid pixel values.
    const g = parsePgm(bytes('P5\n2 1\n255\n', [10, 35]))
    expect(g?.pixels).toEqual(new Uint8Array([10, 35]))
  })

  it.each([
    ['not a P5 file', bytes('P2\n1 1\n255\n', [0])],
    ['a short body', bytes('P5\n2 2\n255\n', [1, 2, 3])],
    ['trailing bytes', bytes('P5\n1 1\n255\n', [1, 2])],
    ['16-bit samples', bytes('P5\n1 1\n65535\n', [1, 2])],
    ['no body at all', bytes('P5\n1 1\n255', [])],
    ['an empty file', new Uint8Array()],
  ])('is null for %s, rather than guessing', (_name, input) => {
    expect(parsePgm(input)).toBeNull()
  })
})

describe('cellAt', () => {
  it('reads the cell under a point as free, occupied or unknown', () => {
    expect(cellAt(floor, grid, [-0.75, -1.75])).toBe('free')      // bottom-left
    expect(cellAt(floor, grid, [-0.25, -1.25])).toBe('free')      // middle row, second column
    expect(cellAt(floor, grid, [0.75, -0.75])).toBe('occupied')   // top-right
  })

  it('counts rows from the bottom of the floor, because PGM row 0 is the top', () => {
    // Read straight off the array (no flip) the bottom-left point lands on row 0,
    // column 0, which is unknown; and the top-right point lands on row 2, col 3.
    expect(cellAt(floor, grid, [-0.75, -1.75])).not.toBe('unknown')
    expect(cellAt(floor, grid, [0.75, -0.75])).not.toBe('unknown')
  })

  it('answers unknown for ground the survey did not classify (the venue is 86% of this)', () => {
    expect(cellAt(floor, grid, [0.25, -1.75])).toBe('unknown')
  })

  it('answers unknown outside the grid, on every side', () => {
    for (const p of [[-1.01, -1], [1.01, -1], [0, -2.01], [0, -0.49]] as [number, number][]) {
      expect(cellAt(floor, grid, p)).toBe('unknown')
    }
  })

  it('reads any value but 254 and 0 as unknown, never free', () => {
    const odd: GridPixels = { width: 1, height: 1, pixels: new Uint8Array([253]) }
    expect(cellAt({ origin_xy_m: [0, 0], resolution_m: 1 }, odd, [0.5, 0.5])).toBe('unknown')
  })

  it('uses the floor\'s own origin and resolution', () => {
    const shifted = { origin_xy_m: [10, 10] as [number, number], resolution_m: 1 }
    const g: GridPixels = { width: 2, height: 1, pixels: new Uint8Array([FREE, OCC]) }
    expect(cellAt(shifted, g, [10.5, 10.5])).toBe('free')
    expect(cellAt(shifted, g, [11.5, 10.5])).toBe('occupied')
    expect(cellAt(shifted, g, [0.5, 0.5])).toBe('unknown')
  })
})

const venue = mockMaps[0]
const wp = (id: string, x: number, y: number, z: number | null = null): MissionWaypoint => ({
  waypoint_id: id, label: id, x_m: x, y_m: y, z_m: z, heading_deg: null,
  tolerance_m: 0.5, actions: [], status: 'pending',
})
const twoFloorMap: SiteMap = {
  ...venue,
  floors: [
    { ...venue.floors[0], index: 0, floor_z_m: 0, origin_xy_m: [-1, -2], resolution_m: 0.5, size_cells: [4, 3] },
    { ...venue.floors[0], index: 1, floor_z_m: 3.1, origin_xy_m: [-1, -2], resolution_m: 0.5, size_cells: [4, 3] },
  ],
}

describe('floorOfWaypoint', () => {
  it('is the floor whose elevation the waypoint carries', () => {
    expect(floorOfWaypoint(twoFloorMap, wp('a', 0, 0, 3.1), 0)?.index).toBe(1)
  })
  it('is the active floor for a waypoint with no elevation', () => {
    expect(floorOfWaypoint(twoFloorMap, wp('a', 0, 0, null), 1)?.index).toBe(1)
  })
  it('is the active floor for an elevation no floor has, rather than none', () => {
    expect(floorOfWaypoint(twoFloorMap, wp('a', 0, 0, 99), 0)?.index).toBe(0)
  })
})

describe('waypointCells', () => {
  // Floor 1 is all free, so a waypoint classified against the WRONG floor shows.
  const allFree: GridPixels = { width: 4, height: 3, pixels: new Uint8Array(12).fill(FREE) }

  it('classifies each waypoint against its own floor\'s grid', () => {
    const cells = waypointCells(twoFloorMap, { 0: grid, 1: allFree }, [wp('up', 0.25, -1.75, 3.1), wp('down', 0.25, -1.75, 0)], 0)
    expect(cells).toEqual({ up: 'free', down: 'unknown' })
  })

  it('says nothing about a waypoint whose grid has not loaded, rather than calling it free', () => {
    expect(waypointCells(twoFloorMap, {}, [wp('a', 0, 0)], 0)).toEqual({})
  })
})

const zone = (over: Partial<MapZone>): MapZone => ({
  zone_id: 'z1', map_id: venue.map_id, kind: 'no_go', label: 'Stairwell',
  polygon: [[0, 0], [2, 0], [2, 2], [0, 2]], ...over,
})
const route = (...wps: MissionWaypoint[]): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'op',
  updated_at: '', map_id: venue.map_id, waypoints: wps, segments: [],
})
const codes = (m: MissionLibraryEntry, ctx: ReturnType<typeof zoneContext>) =>
  validateMission(m, { ...ctx, robotType: null }).issues.map((i) => i.code)

const inMock = { x_m: mockNoGo[0].points[0].x_m + 1, y_m: mockNoGo[0].points[0].y_m + 1 }

describe('zoneContext: the checks read the zones the canvas draws', () => {
  it('reports a waypoint inside a no_go zone of the loaded map', () => {
    const map: SiteMap = { ...venue, zones: [zone({})] }
    expect(codes(route(wp('a', 1, 1), wp('b', 5, 5)), zoneContext(map))).toContain('inNoGo')
  })

  it('does not check against the mock site\'s zones once a map is loaded', () => {
    const map: SiteMap = { ...venue, zones: [] }
    expect(codes(route(wp('a', inMock.x_m, inMock.y_m), wp('b', 0, 0)), zoneContext(map))).not.toContain('inNoGo')
  })

  it('falls back to the mock zones only when there is no map at all', () => {
    expect(codes(route(wp('a', inMock.x_m, inMock.y_m), wp('b', 0, 0)), zoneContext(undefined))).toContain('inNoGo')
  })

  it('does not treat a geofence as no-go, and uses it as the boundary', () => {
    const fence = zone({ zone_id: 'f', kind: 'geofence', label: 'Foyer', polygon: [[-2, -2], [3, -2], [3, 3], [-2, 3]] })
    const ctx = zoneContext({ ...venue, zones: [fence] })
    expect(ctx.noGoZones).toEqual([])
    expect(codes(route(wp('in', 0, 0), wp('out', 40, 40)), ctx)).toEqual(['outsideSite'])
  })

  it('is outside the site only if outside every geofence', () => {
    const a = zone({ zone_id: 'a', kind: 'geofence', polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] })
    const b = zone({ zone_id: 'b', kind: 'geofence', polygon: [[10, 10], [11, 10], [11, 11], [10, 11]] })
    const ctx = zoneContext({ ...venue, zones: [a, b] })
    expect(codes(route(wp('1', 0.5, 0.5), wp('2', 10.5, 10.5)), ctx)).toEqual([])
  })

  it('draws no boundary, so checks none, for a map with no geofence', () => {
    expect(zoneContext({ ...venue, zones: [] }).geofences).toEqual([])
  })
})

describe('zonesFor: a mission is only checked against the map it is on', () => {
  const map: SiteMap = { ...venue, zones: [zone({})] }

  it("uses the loaded map's zones when the mission is on it", () => {
    expect(zonesFor(venue.map_id, map)).toEqual(zoneContext(map))
  })

  it('does not check a mission planned on a different map against the loaded one', () => {
    const ctx = zonesFor('map-older', map)
    expect(ctx.zonesNotChecked).toBe(true)
    expect(ctx.noGoZones).toEqual([])
    // ...so a waypoint inside the loaded map's no-go zone is not flagged.
    expect(codes(route(wp('a', 1, 1), wp('b', 5, 5)), ctx)).not.toContain('inNoGo')
  })

  it('does not check a mission whose map is not loaded at all', () => {
    expect(zonesFor('map-older', undefined).zonesNotChecked).toBe(true)
  })

  it("uses the mock site's zones for a mission that names no map, as before", () => {
    expect(zonesFor('', undefined)).toEqual(zoneContext(undefined))
    expect(zonesFor('', map)).toEqual(zoneContext(undefined))
  })
})

describe('checkAgainstLoadedMap: what the library list shows for each mission', () => {
  const map: SiteMap = { ...venue, zones: [zone({})] }
  const inZone = [wp('a', 1, 1), wp('b', 5, 5)]

  it('flags a mission on the loaded map by the zones of that map', () => {
    const v = checkAgainstLoadedMap({ ...route(...inZone), map_id: venue.map_id }, map, null)
    expect(v.status).toBe('invalid')
    expect(v.issues.map((i) => i.code)).toContain('inNoGo')
  })

  it('reports "not checked", never a verdict, for a mission on any other map', () => {
    const v = checkAgainstLoadedMap({ ...route(...inZone), map_id: 'map-older' }, map, null)
    expect(v.status).toBe('unvalidated')
    expect(v.issues.map((i) => i.code)).toEqual(['zonesNotChecked'])
  })

  it('does not hand a clean mission on another map a green tick', () => {
    const v = checkAgainstLoadedMap({ ...route(wp('a', 50, 50), wp('b', 60, 60)), map_id: 'map-older' }, map, null)
    expect(v.status).not.toBe('valid')
  })
})

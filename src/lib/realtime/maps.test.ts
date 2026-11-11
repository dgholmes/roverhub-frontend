import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => ({ on: vi.fn(), end: vi.fn(), options: {} })),
}))

import { RealDataProvider } from './realDataProvider'
import { MockDataProvider, mockDataProvider } from '@/mocks/mockDataProvider'
import { mockMaps } from '@/mocks/maps'
import { ApiError } from './apiError'
import { MAP_STATUSES, surveyedFraction, type MapZone, type SiteMap } from '@/types/maps'

const API = 'http://api.example:8000'
const BROKER = 'ws://broker.example:9001'

function realProvider() {
  return new RealDataProvider({ wsUrl: BROKER, apiBaseUrl: API })
}

function wireMap(over: Partial<SiteMap> = {}): SiteMap {
  return {
    map_id: 'map-1', site_id: 'site-a', name: 'Level 1', source: 'slam',
    extent_min: [-5.4753, -17.8671], extent_max: [14.5247, 6.1329],
    created_at: '2026-11-06T09:00:00Z', updated_at: '2026-11-06T09:00:00Z',
    geodetic_anchor: null, status: 'active', zones: [],
    floors: [{
      index: 0, label: 'Ground', floor_z_m: -0.34, resolution_m: 0.05,
      origin_xy_m: [-5.4753, -17.8671], size_cells: [400, 480],
      free_cells: 1800, occupied_cells: 24900, unknown_cells: 165300,
    }],
    ...over,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('maps on the mock provider', () => {
  it('returns a map with floors and a surveyed fraction', async () => {
    const maps = await mockDataProvider.listMaps('site-north-yard')
    expect(maps.length).toBeGreaterThan(0)
    const map = maps[0]
    expect(MAP_STATUSES).toContain(map.status)
    expect(map.floors).toHaveLength(1)
    const [floor] = map.floors
    expect(floor.size_cells).toEqual([400, 480])
    expect(floor.resolution_m).toBe(0.05)
    expect(floor.origin_xy_m).toEqual([-5.4753, -17.8671])
    // The 2026-11-06 venue survey: a poorly surveyed floor, on purpose, so the
    // "n% surveyed" warning is reachable by hand in mock mode.
    expect(surveyedFraction(floor)).toBeCloseTo(0.139, 3)
    expect(floor.free_cells + floor.occupied_cells + floor.unknown_cells)
      .toBe(floor.size_cells[0] * floor.size_cells[1])
  })

  it('filters by site', async () => {
    expect(await mockDataProvider.listMaps('site-nowhere')).toEqual([])
  })

  it('getMap finds a known id and resolves null for an unknown one', async () => {
    const [map] = await mockDataProvider.listMaps('site-north-yard')
    expect((await mockDataProvider.getMap(map.map_id))?.map_id).toBe(map.map_id)
    await expect(mockDataProvider.getMap('no-such-map')).resolves.toBeNull()
  })

  it('has no artifacts to point at', () => {
    expect(mockDataProvider.mapArtifactUrl('map-1', 0, 'grid')).toBe('')
  })
})

describe('maps on the real provider', () => {
  it('fetches /maps for the site and parses floors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [wireMap()] }), { status: 200 }),
    )
    const maps = await realProvider().listMaps('site a')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/maps?site_id=site%20a`)
    expect(maps).toHaveLength(1)
    expect(maps[0].floors[0].size_cells).toEqual([400, 480])
    expect(surveyedFraction(maps[0].floors[0])).toBeCloseTo(0.139, 3)
  })

  it('throws when the list cannot be fetched, so the page can say so', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    await expect(realProvider().listMaps('site-a')).rejects.toThrow('500')
  })

  it('getMap returns the map', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(wireMap()), { status: 200 }),
    )
    expect((await realProvider().getMap('map/1'))?.map_id).toBe('map-1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/maps/map%2F1`)
  })

  it('getMap resolves null for an unknown id rather than throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'map not found' }), { status: 404 }),
    )
    await expect(realProvider().getMap('gone')).resolves.toBeNull()
  })

  it('getMap still throws on a server error, which is not "missing"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    await expect(realProvider().getMap('map-1')).rejects.toThrow('500')
  })

  it('mapArtifactUrl points at the backend, not the broker', () => {
    const p = realProvider()
    for (const kind of ['grid', 'preview', 'cloud'] as const) {
      const url = p.mapArtifactUrl('map-1', 2, kind)
      expect(url).toBe(`${API}/maps/map-1/floors/2/${kind}`)
      expect(url).not.toContain('9001')
      expect(url.startsWith(BROKER)).toBe(false)
    }
  })
})

const zone = (over: Partial<MapZone> = {}): MapZone => ({
  zone_id: 'zone-1', map_id: 'map-1', kind: 'no_go', label: 'Stairwell',
  polygon: [[0, 0], [1, 0], [1, 1]], ...over,
})

describe('curating a map on the real provider', () => {
  it('saveMapZones PUTs the zone list and returns the stored map', async () => {
    const stored = wireMap({ zones: [zone()] })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(stored), { status: 200 }),
    )
    const saved = await realProvider().saveMapZones('map/1', [zone()])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/maps/map%2F1/zones`)
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({ zones: [zone()] })
    expect(saved.zones[0].label).toBe('Stairwell')
  })

  it('setMapStatus PUTs the status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(wireMap({ status: 'active' })), { status: 200 }),
    )
    const saved = await realProvider().setMapStatus('map-1', 'active')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/maps/map-1/status`)
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'active' })
    expect(saved.status).toBe('active')
  })

  it('throws an ApiError carrying the server sentence, so the page can show it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'a map with no floors cannot be activated' }), { status: 400 }),
    )
    const error = await realProvider().setMapStatus('map-1', 'active').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).detail).toBe('a map with no floors cannot be activated')
  })

  it('saveMapZones throws on a 403, which is a role that may not edit zones', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }))
    await expect(realProvider().saveMapZones('map-1', [])).rejects.toThrow('403')
  })
})

describe('curating a map on the mock provider', () => {
  it('keeps saved zones for the session, and shows them to listMaps and getMap', async () => {
    const provider = new MockDataProvider()
    const [map] = await provider.listMaps('site-north-yard')
    const saved = await provider.saveMapZones(map.map_id, [zone({ map_id: map.map_id })])
    expect(saved.zones).toHaveLength(1)
    expect((await provider.listMaps('site-north-yard'))[0].zones).toHaveLength(1)
    expect((await provider.getMap(map.map_id))?.zones).toHaveLength(1)
    // ...without editing the shared sample.
    expect(mockMaps[0].zones).toEqual([])
  })

  it('freezes a map, and refuses a map with no floors as the backend does', async () => {
    const provider = new MockDataProvider()
    const [map] = await provider.listMaps('site-north-yard')
    expect((await provider.setMapStatus(map.map_id, 'draft')).status).toBe('draft')
    expect((await provider.setMapStatus(map.map_id, 'active')).status).toBe('active')
    await expect(provider.setMapStatus('no-such-map', 'active')).rejects.toBeInstanceOf(ApiError)
  })
})

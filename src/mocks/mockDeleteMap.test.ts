// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/realtime/apiError'
import { mockMissionLibrary } from './mockMissionLibrary'
import { MockDataProvider } from './mockDataProvider'

// Demo mode's DELETE /maps/{id}: refused as the backend refuses it
// (api/app.py `_map_in_use`), so the Map page's delete can be tried in mock mode.
describe('the mock provider deletes a map as the backend would', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('rh.mock.missions', JSON.stringify([]))
    localStorage.setItem('rh.mock.tasks', JSON.stringify([]))
  })

  it('refuses a map a robot runs with one sentence naming it, and keeps the map', async () => {
    const provider = new MockDataProvider()
    const e = await provider.deleteMap('map-venue-survey').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(409)
    expect((e as ApiError).detail).toMatch(/^map .+ is in use: robots? .+ (runs|run) it \(switch (it|them) to another map first\)$/)
    expect(await provider.getMap('map-venue-survey')).not.toBeNull()
  })

  it('names a mission drawn on the map first', async () => {
    localStorage.setItem('rh.mock.missions', JSON.stringify(mockMissionLibrary.filter((m) => m.map_id === 'map-car-park')))
    const provider = new MockDataProvider()
    const e = await provider.deleteMap('map-car-park').catch((x: unknown) => x)
    expect((e as ApiError).status).toBe(409)
    expect((e as ApiError).detail).toContain('is drawn on it (move or delete it first)')
  })

  it('deletes a free map: gone from the list and from getMap; a second delete is a 404', async () => {
    const provider = new MockDataProvider()
    const site = (await provider.getMap('map-car-park'))!.site_id
    await provider.deleteMap('map-car-park')
    expect(await provider.getMap('map-car-park')).toBeNull()
    expect((await provider.listMaps(site)).map((m) => m.map_id)).not.toContain('map-car-park')
    await expect(provider.deleteMap('map-car-park')).rejects.toMatchObject({ status: 404 })
  })
})

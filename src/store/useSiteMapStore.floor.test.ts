// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteMap } from '@/types/maps'
import { mockMaps } from '@/mocks/maps'
import { viewKey } from '@/lib/viewMemory'

const provider = vi.hoisted(() => ({ listMaps: vi.fn() }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { useSiteMapStore } from './useSiteMapStore'

const base = mockMaps[0]
const floors = (...indexes: number[]) => indexes.map((index) => ({ ...base.floors[0], index }))
const make = (over: Partial<SiteMap>): SiteMap => ({ ...base, ...over })

const threeFloors = make({ map_id: 'm3', status: 'active', updated_at: '2026-11-20T00:00:00Z', floors: floors(0, 1, 2) })
const other = make({ map_id: 'o', status: 'draft', updated_at: '2026-11-01T00:00:00Z', floors: floors(0, 1) })

const remembered = (siteId: string, mapId: string) => {
  const raw = localStorage.getItem(viewKey('floor', siteId, mapId))
  return raw == null ? null : JSON.parse(raw)
}
const rememberFloor = (siteId: string, mapId: string, value: unknown) =>
  localStorage.setItem(viewKey('floor', siteId, mapId), JSON.stringify(value))

const state = () => useSiteMapStore.getState()

beforeEach(() => {
  localStorage.clear()
  provider.listMaps.mockReset()
  useSiteMapStore.setState({ siteId: null, map: null, floorIndex: undefined, maps: null, robotNavMapId: null })
})

afterEach(() => { vi.restoreAllMocks() })

describe('the floor picked on a map is remembered', () => {
  it('remembers the floor per site and map', async () => {
    provider.listMaps.mockResolvedValue([threeFloors])
    await state().load('s')
    state().setFloorIndex(2)
    expect(remembered('s', 'm3')).toBe(2)
  })

  it('opens a map on its remembered floor', async () => {
    rememberFloor('s', 'm3', 1)
    provider.listMaps.mockResolvedValue([threeFloors])
    await state().load('s')
    expect(state().floorIndex).toBe(1)
  })

  it('opens on the first floor when the map no longer has the remembered one', async () => {
    rememberFloor('s', 'm3', 5)
    provider.listMaps.mockResolvedValue([threeFloors])
    await state().load('s')
    expect(state().floorIndex).toBeUndefined()
  })

  it('opens on the first floor for a value that is not a floor index', async () => {
    for (const bad of ['1', 1.5, null, { index: 1 }]) {
      useSiteMapStore.setState({ siteId: null, map: null, floorIndex: undefined, maps: null })
      rememberFloor('s', 'm3', bad)
      provider.listMaps.mockResolvedValue([threeFloors])
      await state().load('s')
      expect(state().floorIndex).toBeUndefined()
    }
  })

  it('opens on the first floor, and does not throw, when storage does', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    provider.listMaps.mockResolvedValue([threeFloors])
    await state().load('s')
    expect(state().floorIndex).toBeUndefined()
    expect(() => state().setFloorIndex(1)).not.toThrow()
    expect(state().floorIndex).toBe(1)
  })

  it('is per site: the same map id on another site has its own floor', async () => {
    rememberFloor('elsewhere', 'm3', 2)
    provider.listMaps.mockResolvedValue([threeFloors])
    await state().load('s')
    expect(state().floorIndex).toBeUndefined()
  })

  it("switching to the robot's other map opens that map's remembered floor", async () => {
    rememberFloor('s', 'o', 1)
    provider.listMaps.mockResolvedValue([threeFloors, other])
    await state().load('s')
    state().setFloorIndex(2)
    state().setRobotNavMapId('o')
    expect(state().map?.map_id).toBe('o')
    expect(state().floorIndex).toBe(1)
    // And back: m3's floor was remembered when it was picked.
    state().setRobotNavMapId(null)
    expect(state().floorIndex).toBe(2)
  })

  it('a refresh that brings a different map opens that map\'s remembered floor', async () => {
    rememberFloor('s', 'o', 1)
    provider.listMaps.mockResolvedValueOnce([other])
    await state().load('s')
    expect(state().floorIndex).toBe(1)
    provider.listMaps.mockResolvedValueOnce([other, threeFloors])   // m3 is newer and active
    await state().reload()
    expect(state().map?.map_id).toBe('m3')
    expect(state().floorIndex).toBeUndefined()
  })

  it('a re-survey that removed the floor still drops it', async () => {
    provider.listMaps.mockResolvedValueOnce([threeFloors])
    await state().load('s')
    state().setFloorIndex(2)
    provider.listMaps.mockResolvedValueOnce([{ ...threeFloors, floors: floors(0, 1) }])
    await state().reload()
    expect(state().floorIndex).toBeUndefined()
  })
})

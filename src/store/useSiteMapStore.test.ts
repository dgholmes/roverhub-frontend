import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteMap } from '@/types/maps'
import { mockMaps } from '@/mocks/maps'

const provider = vi.hoisted(() => ({ listMaps: vi.fn() }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { pickSiteMap, useSiteMapStore } from './useSiteMapStore'

const base = mockMaps[0]
const make = (over: Partial<SiteMap>): SiteMap => ({ ...base, ...over })

describe('pickSiteMap', () => {
  it('prefers the active map, even over a newer draft', () => {
    const active = make({ map_id: 'a', status: 'active', updated_at: '2026-11-01T00:00:00Z' })
    const draft = make({ map_id: 'd', status: 'draft', updated_at: '2026-11-07T00:00:00Z' })
    expect(pickSiteMap([draft, active])?.map_id).toBe('a')
  })

  it('falls back to the most recently updated map when none is active', () => {
    const old = make({ map_id: 'old', status: 'draft', updated_at: '2026-11-01T00:00:00Z' })
    const recent = make({ map_id: 'recent', status: 'archived', updated_at: '2026-11-05T00:00:00Z' })
    expect(pickSiteMap([old, recent])?.map_id).toBe('recent')
  })

  it('breaks a tie between active maps by recency', () => {
    const a = make({ map_id: 'a', updated_at: '2026-11-01T00:00:00Z' })
    const b = make({ map_id: 'b', updated_at: '2026-11-03T00:00:00Z' })
    expect(pickSiteMap([a, b])?.map_id).toBe('b')
  })

  it('is null for a site with no maps', () => {
    expect(pickSiteMap([])).toBeNull()
  })
})

describe('useSiteMapStore', () => {
  beforeEach(() => {
    provider.listMaps.mockReset()
    useSiteMapStore.setState({ siteId: null, map: null, floorIndex: undefined })
  })

  it('loads the chosen map for a site, once', async () => {
    provider.listMaps.mockResolvedValue([base])
    await useSiteMapStore.getState().load('site-north-yard')
    await useSiteMapStore.getState().load('site-north-yard')
    expect(useSiteMapStore.getState().map?.map_id).toBe(base.map_id)
    expect(provider.listMaps).toHaveBeenCalledTimes(1)
  })

  it('keeps the same map object when asked again, so MapCanvas props stay stable', async () => {
    provider.listMaps.mockResolvedValue([base])
    await useSiteMapStore.getState().load('s')
    const first = useSiteMapStore.getState().map
    await useSiteMapStore.getState().load('s')
    expect(useSiteMapStore.getState().map).toBe(first)
  })

  it('shows no map, and does not throw, when the maps cannot be fetched', async () => {
    provider.listMaps.mockRejectedValue(new Error('GET /maps answered 404'))
    await expect(useSiteMapStore.getState().load('s')).resolves.toBeUndefined()
    expect(useSiteMapStore.getState().map).toBeNull()
  })

  it('drops the previous site\'s map and floor when the site changes', async () => {
    provider.listMaps.mockResolvedValueOnce([base])
    await useSiteMapStore.getState().load('a')
    useSiteMapStore.getState().setFloorIndex(1)
    provider.listMaps.mockResolvedValueOnce([])
    await useSiteMapStore.getState().load('b')
    expect(useSiteMapStore.getState().map).toBeNull()
    expect(useSiteMapStore.getState().floorIndex).toBeUndefined()
  })

  it('ignores a slow answer for a site the operator has already left', async () => {
    let resolveA: (m: SiteMap[]) => void = () => {}
    provider.listMaps.mockReturnValueOnce(new Promise<SiteMap[]>((r) => { resolveA = r }))
    provider.listMaps.mockResolvedValueOnce([])
    const slow = useSiteMapStore.getState().load('a')
    await useSiteMapStore.getState().load('b')
    resolveA([base])
    await slow
    expect(useSiteMapStore.getState().siteId).toBe('b')
    expect(useSiteMapStore.getState().map).toBeNull()
  })

  it('has a setFloorIndex that never changes identity', () => {
    const before = useSiteMapStore.getState().setFloorIndex
    useSiteMapStore.getState().setFloorIndex(2)
    expect(useSiteMapStore.getState().setFloorIndex).toBe(before)
    expect(useSiteMapStore.getState().floorIndex).toBe(2)
  })
})

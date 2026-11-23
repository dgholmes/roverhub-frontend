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

  it("prefers the robot's nav_map_id, then the newest active, then the newest", () => {
    const active = make({ map_id: 'a', status: 'active', updated_at: '2026-11-01T00:00:00Z' })
    const robots = make({ map_id: 'r', status: 'draft', updated_at: '2026-10-01T00:00:00Z' })
    const newest = make({ map_id: 'n', status: 'draft', updated_at: '2026-11-09T00:00:00Z' })
    expect(pickSiteMap([active, robots, newest], 'r')?.map_id).toBe('r')
    // A map the site does not have, or no robot map: as before.
    expect(pickSiteMap([active, robots, newest], 'map-elsewhere')?.map_id).toBe('a')
    expect(pickSiteMap([active, robots, newest], null)?.map_id).toBe('a')
    expect(pickSiteMap([robots, newest], 'map-elsewhere')?.map_id).toBe('n')
  })
})

describe('useSiteMapStore', () => {
  beforeEach(() => {
    provider.listMaps.mockReset()
    useSiteMapStore.setState({ siteId: null, map: null, floorIndex: undefined, maps: null, robotNavMapId: null })
  })

  it("draws the selected robot's map, and picks again without a fetch when the robot changes", async () => {
    const active = { ...base, map_id: 'a', status: 'active' as const, updated_at: '2026-11-01T00:00:00Z' }
    const robots = { ...base, map_id: 'r', status: 'draft' as const, updated_at: '2026-10-01T00:00:00Z' }
    provider.listMaps.mockResolvedValue([active, robots])
    useSiteMapStore.getState().setRobotNavMapId('r')
    await useSiteMapStore.getState().load('s')
    expect(useSiteMapStore.getState().map?.map_id).toBe('r')
    useSiteMapStore.getState().setFloorIndex(0)
    useSiteMapStore.getState().setRobotNavMapId(null)
    expect(useSiteMapStore.getState().map?.map_id).toBe('a')
    expect(useSiteMapStore.getState().floorIndex).toBeUndefined()
    const shown = useSiteMapStore.getState().map
    // A robot on a map the site does not have: the same pick, the same object.
    useSiteMapStore.getState().setRobotNavMapId('map-elsewhere')
    expect(useSiteMapStore.getState().map).toBe(shown)
    expect(provider.listMaps).toHaveBeenCalledTimes(1)
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().map?.map_id).toBe('a')
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

describe('useSiteMapStore.reload', () => {
  beforeEach(() => {
    provider.listMaps.mockReset()
    useSiteMapStore.setState({ siteId: null, map: null, floorIndex: undefined })
  })

  it('picks up a map made after an earlier "no maps" answer, which load alone caches', async () => {
    provider.listMaps.mockResolvedValueOnce([])
    await useSiteMapStore.getState().load('s')
    expect(useSiteMapStore.getState().map).toBeNull()

    provider.listMaps.mockResolvedValueOnce([base])
    await useSiteMapStore.getState().load('s')            // still the cached answer
    expect(useSiteMapStore.getState().map).toBeNull()
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().map?.map_id).toBe(base.map_id)
  })

  it('shows a changed map, as after zones are saved or a map is frozen', async () => {
    provider.listMaps.mockResolvedValueOnce([make({ status: 'draft' })])
    await useSiteMapStore.getState().load('s')
    provider.listMaps.mockResolvedValueOnce([make({ status: 'active' })])
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().map?.status).toBe('active')
  })

  it('keeps the map on screen while it fetches, rather than blanking the canvas', async () => {
    provider.listMaps.mockResolvedValueOnce([base])
    await useSiteMapStore.getState().load('s')
    let resolve: (m: SiteMap[]) => void = () => {}
    provider.listMaps.mockReturnValueOnce(new Promise<SiteMap[]>((r) => { resolve = r }))
    const pending = useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().map?.map_id).toBe(base.map_id)
    resolve([base])
    await pending
  })

  it('keeps the map it has when the refresh fails', async () => {
    provider.listMaps.mockResolvedValueOnce([base])
    await useSiteMapStore.getState().load('s')
    provider.listMaps.mockRejectedValueOnce(new Error('GET /maps answered 500'))
    await expect(useSiteMapStore.getState().reload()).resolves.toBeUndefined()
    expect(useSiteMapStore.getState().map?.map_id).toBe(base.map_id)
  })

  it('keeps the chosen floor while the map still has it, and drops it when it does not', async () => {
    const twoFloors = make({ floors: [base.floors[0], { ...base.floors[0], index: 1 }] })
    provider.listMaps.mockResolvedValueOnce([twoFloors])
    await useSiteMapStore.getState().load('s')
    useSiteMapStore.getState().setFloorIndex(1)

    provider.listMaps.mockResolvedValueOnce([twoFloors])
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().floorIndex).toBe(1)

    provider.listMaps.mockResolvedValueOnce([base])        // a re-survey with one floor
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().floorIndex).toBeUndefined()
  })

  it('does nothing before any site has been loaded', async () => {
    await useSiteMapStore.getState().reload()
    expect(provider.listMaps).not.toHaveBeenCalled()
  })

  it('ignores an answer for a site the operator has already left', async () => {
    provider.listMaps.mockResolvedValueOnce([base])
    await useSiteMapStore.getState().load('a')
    let resolveA: (m: SiteMap[]) => void = () => {}
    provider.listMaps.mockReturnValueOnce(new Promise<SiteMap[]>((r) => { resolveA = r }))
    const slow = useSiteMapStore.getState().reload()
    provider.listMaps.mockResolvedValueOnce([])
    await useSiteMapStore.getState().load('b')
    resolveA([base])
    await slow
    expect(useSiteMapStore.getState().siteId).toBe('b')
    expect(useSiteMapStore.getState().map).toBeNull()
  })

  it('keeps the same map object when a refresh finds nothing new', async () => {
    provider.listMaps.mockResolvedValueOnce([make({})])
    await useSiteMapStore.getState().load('s')
    const first = useSiteMapStore.getState().map
    provider.listMaps.mockResolvedValueOnce([make({})])   // equal, but a new object
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().map).toBe(first)
    provider.listMaps.mockResolvedValueOnce([make({ updated_at: '2026-11-18T05:04:33Z' })])
    await useSiteMapStore.getState().reload()
    expect(useSiteMapStore.getState().map).not.toBe(first)
    expect(useSiteMapStore.getState().map?.updated_at).toBe('2026-11-18T05:04:33Z')
  })

  it('shows the newest refresh\'s answer even when an older one lands after it', async () => {
    provider.listMaps.mockResolvedValueOnce([base])
    await useSiteMapStore.getState().load('s')
    let resolveOld: (m: SiteMap[]) => void = () => {}
    provider.listMaps.mockReturnValueOnce(new Promise<SiteMap[]>((r) => { resolveOld = r }))
    const old = useSiteMapStore.getState().reload()           // a poll, before the edit
    provider.listMaps.mockResolvedValueOnce([make({ updated_at: '2026-11-18T05:04:33Z' })])
    await useSiteMapStore.getState().reload()                 // after the edit was saved
    resolveOld([base])
    await old
    expect(useSiteMapStore.getState().map?.updated_at).toBe('2026-11-18T05:04:33Z')
  })

  it('has a reload that never changes identity', () => {
    const before = useSiteMapStore.getState().reload
    useSiteMapStore.setState({ floorIndex: 3 })
    expect(useSiteMapStore.getState().reload).toBe(before)
  })
})

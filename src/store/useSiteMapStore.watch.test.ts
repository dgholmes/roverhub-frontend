// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteMap } from '@/types/maps'
import { mockMaps } from '@/mocks/maps'

const provider = vi.hoisted(() => ({ listMaps: vi.fn() }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { MAP_REFRESH_MS, mapsChanged, useSiteMapStore, watchSiteMap } from './useSiteMapStore'

/** A stand-in BroadcastChannel: every channel of a name hears the others'
 * messages, as tabs of one browser do (and not its own). */
class FakeChannel {
  static open: FakeChannel[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(readonly name: string) { FakeChannel.open.push(this) }
  postMessage(data: unknown) {
    for (const c of FakeChannel.open) if (c !== this && c.name === this.name) c.onmessage?.({ data })
  }
  close() { FakeChannel.open = FakeChannel.open.filter((c) => c !== this) }
}

const edited: SiteMap = { ...mockMaps[0], updated_at: '2026-11-18T05:04:33Z' }
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => {
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  FakeChannel.open = []
  provider.listMaps.mockReset().mockResolvedValue([mockMaps[0]])
  useSiteMapStore.setState({ siteId: null, map: null, floorIndex: undefined })
  await useSiteMapStore.getState().load('s')
  provider.listMaps.mockClear().mockResolvedValue([edited])
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('watchSiteMap: an open LiveOps follows map edits', () => {
  it('fetches the map again when another tab says a map changed', async () => {
    const stop = watchSiteMap(0)
    // Missions › Maps, in another tab, after a save.
    new FakeChannel('rh.maps').postMessage('changed')
    await flush()
    expect(provider.listMaps).toHaveBeenCalledTimes(1)
    expect(useSiteMapStore.getState().map?.updated_at).toBe(edited.updated_at)
    stop()
  })

  it('mapsChanged tells the other tabs, and refreshes its own', async () => {
    const other = new FakeChannel('rh.maps')
    const heard = vi.fn()
    other.onmessage = heard
    await mapsChanged()
    expect(heard).toHaveBeenCalledOnce()
    expect(useSiteMapStore.getState().map?.updated_at).toBe(edited.updated_at)
  })

  it('fetches again when the tab is focused, and on a poll while visible', async () => {
    vi.useFakeTimers()
    const stop = watchSiteMap()
    window.dispatchEvent(new Event('focus'))
    expect(provider.listMaps).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(MAP_REFRESH_MS)
    expect(provider.listMaps).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(MAP_REFRESH_MS * 3)
    window.dispatchEvent(new Event('focus'))
    expect(provider.listMaps).toHaveBeenCalledTimes(2)
  })

  it('shares one set of listeners between views, until the last one goes', async () => {
    const a = watchSiteMap(0)
    const b = watchSiteMap(0)
    expect(FakeChannel.open).toHaveLength(1)
    window.dispatchEvent(new Event('focus'))
    expect(provider.listMaps).toHaveBeenCalledTimes(1)
    a()
    a() // twice is once
    expect(FakeChannel.open).toHaveLength(1)
    b()
    expect(FakeChannel.open).toHaveLength(0)
    await flush()
  })
})

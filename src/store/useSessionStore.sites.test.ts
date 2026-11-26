import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/realtime/apiError'
import type { Site as SiteRecord } from '@/types/sites'

const { provider } = vi.hoisted(() => ({
  provider: {
    listSites: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
  },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { useSessionStore } from './useSessionStore'

const record = (over: Partial<SiteRecord> = {}): SiteRecord => ({
  site_id: 'site-dev', name: 'PICT Square', timezone: 'Asia/Seoul', address: '1 Tech-ro', location: { lat: 37.5, lng: 127 },
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T01:00:00Z', ...over,
})

beforeEach(() => {
  for (const f of Object.values(provider)) f.mockReset()
  useSessionStore.setState({ sites: [], sitesStatus: 'idle', sitesError: null, activeSiteId: 'site-dev' })
})

describe('sites in the session store (GET /sites)', () => {
  it('loads the stored sites, with id for site_id', async () => {
    provider.listSites.mockResolvedValue([record(), record({ site_id: 'site-mall', name: 'Mall', address: null, location: null })])
    await useSessionStore.getState().loadSites()
    const s = useSessionStore.getState()
    expect(s.sitesStatus).toBe('ready')
    expect(s.sites).toEqual([
      { id: 'site-dev', name: 'PICT Square', timezone: 'Asia/Seoul', address: '1 Tech-ro', location: { lat: 37.5, lng: 127 }, updatedAt: '2026-11-26T01:00:00Z' },
      { id: 'site-mall', name: 'Mall', timezone: 'Asia/Seoul', address: null, location: undefined, updatedAt: '2026-11-26T01:00:00Z' },
    ])
  })

  it('is loading meanwhile, and leaves the active site alone, so a site route that opened first still works', async () => {
    let answer: (v: SiteRecord[]) => void = () => {}
    provider.listSites.mockReturnValue(new Promise<SiteRecord[]>((r) => { answer = r }))
    useSessionStore.setState({ activeSiteId: 'site-elsewhere' })
    const loading = useSessionStore.getState().loadSites()
    await Promise.resolve()
    expect(useSessionStore.getState().sitesStatus).toBe('loading')
    answer([record()])
    await loading
    expect(useSessionStore.getState().sitesStatus).toBe('ready')
    expect(useSessionStore.getState().activeSiteId).toBe('site-elsewhere')
  })

  it('keeps the last list and says why when a reload fails', async () => {
    provider.listSites.mockResolvedValueOnce([record()])
    await useSessionStore.getState().loadSites()
    provider.listSites.mockRejectedValueOnce(new ApiError(500, null, 'GET /sites answered 500'))
    await useSessionStore.getState().loadSites()
    const s = useSessionStore.getState()
    expect(s.sitesStatus).toBe('error')
    expect(s.sitesError).toBe('GET /sites answered 500')
    expect(s.sites.map((x) => x.id)).toEqual(['site-dev'])
  })

  it('applies only the newest of two overlapping loads', async () => {
    let first: (v: SiteRecord[]) => void = () => {}
    provider.listSites
      .mockReturnValueOnce(new Promise<SiteRecord[]>((r) => { first = r }))
      .mockResolvedValueOnce([record({ name: 'Newest' })])
    const a = useSessionStore.getState().loadSites()
    await useSessionStore.getState().loadSites()
    first([record({ name: 'Stale' })])
    await a
    expect(useSessionStore.getState().sites[0].name).toBe('Newest')
  })

  it('addSite persists through createSite and joins the list', async () => {
    provider.createSite.mockResolvedValue(record({ site_id: 'site-west', name: 'West' }))
    const site = await useSessionStore.getState().addSite({ name: 'West', timezone: 'Asia/Seoul' })
    expect(provider.createSite).toHaveBeenCalledWith({ name: 'West', timezone: 'Asia/Seoul' })
    expect(site.id).toBe('site-west')
    expect(useSessionStore.getState().sites.map((s) => s.id)).toEqual(['site-west'])
  })

  it('addSite passes the refusal on and adds nothing', async () => {
    provider.createSite.mockRejectedValue(new ApiError(409, { detail: 'taken' }, 'POST /sites answered 409: taken'))
    await expect(useSessionStore.getState().addSite({ name: 'X', timezone: 'UTC' })).rejects.toBeInstanceOf(ApiError)
    expect(useSessionStore.getState().sites).toEqual([])
  })

  it('updateSite replaces the site in place; deleteSite removes it', async () => {
    provider.listSites.mockResolvedValue([record(), record({ site_id: 'site-mall', name: 'Mall' })])
    await useSessionStore.getState().loadSites()
    provider.updateSite.mockResolvedValue(record({ name: 'PICT' }))
    await useSessionStore.getState().updateSite('site-dev', { name: 'PICT' })
    expect(provider.updateSite).toHaveBeenCalledWith('site-dev', { name: 'PICT' })
    expect(useSessionStore.getState().sites.map((s) => s.name)).toEqual(['PICT', 'Mall'])
    provider.deleteSite.mockResolvedValue(undefined)
    await useSessionStore.getState().deleteSite('site-mall')
    expect(useSessionStore.getState().sites.map((s) => s.id)).toEqual(['site-dev'])
  })

  it('a refused delete keeps the site', async () => {
    provider.listSites.mockResolvedValue([record()])
    await useSessionStore.getState().loadSites()
    provider.deleteSite.mockRejectedValue(new ApiError(409, { detail: 'robots are registered there' }, 'x'))
    await expect(useSessionStore.getState().deleteSite('site-dev')).rejects.toBeInstanceOf(ApiError)
    expect(useSessionStore.getState().sites.map((s) => s.id)).toEqual(['site-dev'])
  })
})

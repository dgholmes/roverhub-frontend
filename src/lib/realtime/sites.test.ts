import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => ({ on: vi.fn(), end: vi.fn(), options: {} })),
}))

import { RealDataProvider } from './realDataProvider'
import { MockDataProvider } from '@/mocks/mockDataProvider'
import { mockSites } from '@/mocks/mockOrg'
import { ApiError } from './apiError'
import type { Site } from '@/types/sites'

const API = 'http://api.example:8000'

function realProvider() {
  return new RealDataProvider({ wsUrl: 'ws://broker.example:9001', apiBaseUrl: API })
}

const wireSite = (over: Partial<Site> = {}): Site => ({
  site_id: 'site-dev', name: 'PICT Square', timezone: 'Asia/Seoul', address: null, location: null,
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z', ...over,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.restoreAllMocks())

describe('sites on the real provider (REST, spec 2026-11-26 §2)', () => {
  it('GET /sites, as a bare list or in the {items} envelope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json([wireSite()]))
    expect(await realProvider().listSites()).toEqual([wireSite()])
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/sites`)
    fetchMock.mockResolvedValueOnce(json({ items: [wireSite({ site_id: 'site-mall' })] }))
    expect((await realProvider().listSites()).map((s) => s.site_id)).toEqual(['site-mall'])
  })

  it('throws an ApiError when the list cannot be read, so a backend without sites reads as unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Not Found' }, 404))
    const e = await realProvider().listSites().catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(404)
  })

  it('POST /sites sends the body and returns the stored site', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(wireSite({ site_id: 'site-west' }), 201))
    const made = await realProvider().createSite({ name: 'West', timezone: 'Asia/Seoul' })
    expect(made.site_id).toBe('site-west')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/sites`)
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'West', timezone: 'Asia/Seoul' })
  })

  it('a taken id (409) and a bad field (422) throw with the server’s detail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ detail: 'site site-dev already exists' }, 409))
      .mockResolvedValueOnce(json({ detail: [{ loc: ['body', 'timezone'], msg: 'unknown timezone' }] }, 422))
    const taken = await realProvider().createSite({ site_id: 'site-dev', name: 'X', timezone: 'UTC' }).catch((x) => x) as ApiError
    expect(taken.status).toBe(409)
    expect(taken.detail).toBe('site site-dev already exists')
    const bad = await realProvider().createSite({ name: 'X', timezone: 'Mars/Base' }).catch((x) => x) as ApiError
    expect(bad.status).toBe(422)
  })

  it('PATCH /sites/{id} sends only the fields given, nulls included', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(wireSite({ name: 'New name' })))
    await realProvider().updateSite('site/dev', { name: 'New name', address: null })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/sites/site%2Fdev`)
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'New name', address: null })
  })

  it('DELETE /sites/{id}: 204 resolves, a 409 throws with what keeps the site', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(realProvider().deleteSite('site-old')).resolves.toBeUndefined()
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
    fetchMock.mockResolvedValueOnce(json({ detail: 'robots are registered at site-dev: rover-pi' }, 409))
    const e = await realProvider().deleteSite('site-dev').catch((x) => x) as ApiError
    expect(e.status).toBe(409)
    expect(e.detail).toContain('rover-pi')
  })
})

describe('sites on the mock provider', () => {
  it('starts with the mock sites', async () => {
    const ids = (await new MockDataProvider().listSites()).map((s) => s.site_id).sort()
    expect(ids).toEqual(mockSites.map((s) => s.site_id).sort())
  })

  it('creates a site with a derived id, and refuses the same id again (409)', async () => {
    const p = new MockDataProvider()
    const made = await p.createSite({ name: 'West Depot', timezone: 'Asia/Seoul' })
    expect(made.site_id).toBe('site-west-depot')
    expect((await p.listSites()).some((s) => s.site_id === 'site-west-depot')).toBe(true)
    const e = await p.createSite({ name: 'West Depot', timezone: 'UTC' }).catch((x) => x) as ApiError
    expect(e.status).toBe(409)
  })

  it('refuses a bad timezone, an empty name and an impossible location (422)', async () => {
    const p = new MockDataProvider()
    for (const bad of [
      { name: 'X', timezone: 'Mars/Base' },
      { name: '  ', timezone: 'UTC' },
      { name: 'X', timezone: 'UTC', location: { lat: 91, lng: 0 } },
    ]) {
      expect(((await p.createSite(bad).catch((x) => x)) as ApiError).status).toBe(422)
    }
  })

  it('updates only what is given, and an explicit null clears', async () => {
    const p = new MockDataProvider()
    const before = (await p.listSites()).find((s) => s.site_id === 'site-north-yard')!
    expect(before.location).not.toBeNull()
    const after = await p.updateSite('site-north-yard', { name: 'North Yard', location: null })
    expect(after.name).toBe('North Yard')
    expect(after.timezone).toBe(before.timezone)
    expect(after.address).toBe(before.address)
    expect(after.location).toBeNull()
  })

  it('refuses to delete a site with robots or maps (409, naming them), and deletes an empty one', async () => {
    const p = new MockDataProvider()
    const e = await p.deleteSite('site-north-yard').catch((x) => x) as ApiError
    expect(e.status).toBe(409)
    expect(e.detail).toMatch(/robots are registered there/)
    expect(e.detail).toMatch(/Venue survey/)
    await p.deleteSite('site-plant-3')
    expect((await p.listSites()).some((s) => s.site_id === 'site-plant-3')).toBe(false)
  })
})

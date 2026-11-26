import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => ({ on: vi.fn(), end: vi.fn(), options: {} })),
}))
const upload = vi.hoisted(() => ({ answer: { status: 202, body: {} as unknown }, calls: [] as { url: string; form: FormData }[] }))
vi.mock('./uploadWithProgress', () => ({
  postFormWithProgress: vi.fn(async (url: string, form: FormData, options: { onProgress?: (f: number) => void }) => {
    upload.calls.push({ url, form })
    options.onProgress?.(0.5)
    options.onProgress?.(1)
    return upload.answer
  }),
}))

import { RealDataProvider } from './realDataProvider'
import { ApiError } from './apiError'
import { freezeRefusalOf } from '@/components/maps/mapPipeline'
import type { MapJob } from '@/types/mapPipeline'

const API = 'http://api.example:8000'
const provider = () => new RealDataProvider({ wsUrl: 'ws://broker.example:9001', apiBaseUrl: API })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const job = (over: Partial<MapJob> = {}): MapJob => ({
  job_id: 'mjob-1', kind: 'survey', map_id: 'map-office', site_id: 'site-a', status: 'queued', stage: 'queued',
  created_at: '2026-11-16T05:00:00Z', started_at: null, finished_at: null, error: null, result: null, ...over,
})

beforeEach(() => { upload.calls.length = 0; upload.answer = { status: 202, body: job() } })
afterEach(() => vi.restoreAllMocks())

describe('survey upload on the real provider', () => {
  it('POSTs the files and fields /map-surveys expects, reports progress, and returns the job', async () => {
    const progress: number[] = []
    const got = await provider().uploadSurvey({
      siteId: 'site-a', name: 'Office L1', mapId: 'map-office', floor: 2,
      cloud: new Blob(['pcd']), cloudName: 'scans.pcd', track: new Blob(['t,x,y,z\n']), trackName: 'path.csv',
    }, { onProgress: (f) => progress.push(f) })
    expect(got.job_id).toBe('mjob-1')
    expect(progress).toEqual([0.5, 1])
    const { url, form } = upload.calls[0]
    expect(url).toBe(`${API}/map-surveys`)
    expect(form.get('site_id')).toBe('site-a')
    expect(form.get('name')).toBe('Office L1')
    expect(form.get('map_id')).toBe('map-office')
    expect(form.get('floor')).toBe('2')
    expect((form.get('cloud') as File).name).toBe('scans.pcd')
    expect((form.get('track') as File).name).toBe('path.csv')
    // Only the parts the backend accepts: anything else is a 400 there.
    expect([...form.keys()].sort()).toEqual(['cloud', 'floor', 'map_id', 'name', 'site_id', 'track'])
  })

  it('throws an ApiError with the server sentence when the upload is refused', async () => {
    upload.answer = { status: 413, body: { detail: 'upload exceeds 1073741824 bytes' } }
    const e = await provider().uploadSurvey({
      siteId: 's', name: 'n', mapId: 'map-n', floor: 0, cloud: new Blob([]), cloudName: 'c.pcd', track: new Blob([]), trackName: 't.csv',
    }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(413)
    expect((e as ApiError).detail).toMatch(/exceeds/)
  })
})

describe('map jobs, quality and versions on the real provider', () => {
  it('reads one job and lists jobs, optionally for one map', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(job({ status: 'running', stage: 'levelling' })))
      .mockResolvedValueOnce(json({ items: [job()] }))
      .mockResolvedValueOnce(json({ items: [] }))
    expect((await provider().getMapJob('mjob/1')).stage).toBe('levelling')
    expect(await provider().listMapJobs('map a')).toHaveLength(1)
    expect(await provider().listMapJobs()).toEqual([])
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `${API}/map-jobs/mjob%2F1`, `${API}/map-jobs?map_id=map%20a`, `${API}/map-jobs`,
    ])
  })

  it('getMapQuality returns the report, null when none has run, and throws on a server error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ passed: true, current: false, failed: [], checks: [] }))
      .mockResolvedValueOnce(json({ detail: 'no quality report has run for this map' }, 404))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
    expect((await provider().getMapQuality('map-1'))?.current).toBe(false)
    expect(await provider().getMapQuality('map-1')).toBeNull()
    await expect(provider().getMapQuality('map-1')).rejects.toThrow('500')
  })

  it('recheckMapQuality POSTs and returns the queued job', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(job({ kind: 'quality' }), 202))
    expect((await provider().recheckMapQuality('map-1')).kind).toBe('quality')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/maps/map-1/quality`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('lists versions and restores one', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ items: [{ version: 3, current: true }, { version: 2, current: false }] }))
      .mockResolvedValueOnce(json({ map_id: 'map-1', status: 'draft' }))
    expect((await provider().listMapVersions('map-1')).map((v) => v.version)).toEqual([3, 2])
    expect((await provider().restoreMapVersion('map-1', 2)).status).toBe('draft')
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/maps/map-1/versions/2/restore`)
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')
  })

  it('a refused restore carries the server sentence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'map map-1 has no version 9' }, 404))
    await expect(provider().restoreMapVersion('map-1', 9)).rejects.toThrow('has no version 9')
  })
})

describe('freezing through the quality gate on the real provider', () => {
  it('sends only the status without an override, as before', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'active' }))
    await provider().setMapStatus('map-1', 'active')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ status: 'active' })
  })

  it('sends override_quality and the reason with an override', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'active' }))
    await provider().setMapStatus('map-1', 'active', { reason: 'corridor only' })
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string))
      .toEqual({ status: 'active', override_quality: true, reason: 'corridor only' })
  })

  it("a 409 from the gate is read as the backend's refusal, with its code and failed checks", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      detail: { code: 'quality_failed', failed: ['free_area_m2'], message: 'the quality report failed (free_area_m2); freezing it anyway needs an override' },
    }, 409))
    const e = await provider().setMapStatus('map-1', 'active').catch((x: unknown) => x)
    expect(freezeRefusalOf(e)).toEqual({
      code: 'quality_failed', failed: ['free_area_m2'],
      message: 'the quality report failed (free_area_m2); freezing it anyway needs an override',
    })
  })
})

describe('trim, rename and the zones review on the real provider (0.0.29)', () => {
  it('POSTs the trim to the floor and returns the new draft', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ map_id: 'map 1', status: 'draft' }))
    const got = await provider().trimFloor('map 1', 2)
    expect(got.status).toBe('draft')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/maps/map%201/floors/2/trim`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('PATCHes only what is renamed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ map_id: 'map-1', name: 'Office' }))
    await provider().renameMap('map-1', { name: 'Office' })
    await provider().renameMap('map-1', { floors: [{ index: 0, label: '2F' }, { index: 1, label: null }] })
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/maps/map-1`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ name: 'Office' })
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ floors: [{ index: 0, label: '2F' }, { index: 1, label: null }] })
  })

  it('DELETEs a map, and throws the 409 sentence naming what is in the way as it is', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }))
    await provider().deleteMap('map 1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/maps/map%201`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
    const sentence = 'map Office is in use: mission Pictlab is drawn on it (move or delete it first)'
    fetchMock.mockResolvedValueOnce(json({ detail: sentence }, 409))
    const e = await provider().deleteMap('map-1').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 409, detail: sentence })
  })

  it("throws the backend's refusal for a trim or a rename", async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ detail: 'zone Stage lies outside the trimmed floor' }, 409))
    const e = await provider().trimFloor('map-1', 0).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 409, detail: 'zone Stage lies outside the trimmed floor' })
    await expect(provider().renameMap('map-1', { name: 'x' })).rejects.toBeInstanceOf(ApiError)
  })

  it('sends zones_reviewed with the status, alone or beside an override', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ status: 'active' }))
    await provider().setMapStatus('map-1', 'active', { zonesReviewed: true })
    await provider().setMapStatus('map-1', 'active', { zonesReviewed: true, reason: 'corridor only' })
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ status: 'active', zones_reviewed: true })
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string))
      .toEqual({ status: 'active', override_quality: true, reason: 'corridor only', zones_reviewed: true })
  })
})

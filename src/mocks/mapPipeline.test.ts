import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/realtime/apiError'
import { freezeRefusalOf } from '@/components/maps/mapPipeline'
import type { SiteMap } from '@/types/maps'
import type { SurveyUpload } from '@/types/mapPipeline'
import { mockMaps } from './maps'
import { MockDataProvider } from './mockDataProvider'
import { MockMapPipeline, mockQualityReport } from './mapPipeline'

/** A pipeline over a plain map store, on a clock the test moves. */
function setup(seed: SiteMap[] = mockMaps) {
  const maps = new Map(seed.map((m) => [m.map_id, m]))
  let now = Date.parse('2026-11-16T05:00:00Z')
  const pipeline = new MockMapPipeline({ get: (id) => maps.get(id) ?? null, put: (m) => { maps.set(m.map_id, m) } },
    { now: () => now, uploadStepMs: 0 })
  return { pipeline, maps, advance: (ms: number) => { now += ms } }
}

const survey = (over: Partial<SurveyUpload> = {}): SurveyUpload => ({
  siteId: 'site-north-yard', name: 'Office L1', mapId: 'map-office', floor: 0,
  cloud: new Blob(['# .PCD v0.7']), cloudName: 'office.pcd',
  track: new Blob(['t,x,y,z\n0,0,0,0\n1,0.5,0,0\n']), trackName: 'office-track.csv', ...over,
})

describe('the mock survey pipeline', () => {
  it('uploads with progress, walks the backend stages, and stores a draft whose report passes', async () => {
    const { pipeline, maps, advance } = setup()
    const progress: number[] = []
    const queued = await pipeline.uploadSurvey(survey(), { onProgress: (f) => progress.push(f) })
    expect(progress).toEqual([0.2, 0.4, 0.6, 0.8, 1])
    expect(queued).toMatchObject({ kind: 'survey', status: 'queued', map_id: 'map-office' })
    advance(1700)
    expect(pipeline.getJob(queued.job_id)).toMatchObject({ status: 'running', stage: 'levelling' })
    expect(maps.has('map-office')).toBe(false)
    advance(4000)
    const done = pipeline.getJob(queued.job_id)
    expect(done).toMatchObject({ status: 'succeeded', stage: 'done' })
    expect(done.result).toMatchObject({ map_id: 'map-office', version: 1, quality: { passed: true } })
    expect(maps.get('map-office')).toMatchObject({ status: 'draft', name: 'Office L1' })
    expect(pipeline.getQuality('map-office')).toMatchObject({ passed: true, current: true, version: 1 })
    expect(pipeline.listVersions('map-office').map((v) => [v.version, v.current, v.source])).toEqual([[1, true, 'survey']])
  })

  it("fails the job with the backend's sentence when the track has no t,x,y,z header", async () => {
    const { pipeline, maps, advance } = setup()
    const queued = await pipeline.uploadSurvey(survey({ track: new Blob(['time,x,y\n']) }))
    advance(2000)
    expect(pipeline.getJob(queued.job_id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/t,x,y,z/) })
    expect(maps.has('map-office')).toBe(false)
  })

  it('replacing a map keeps its zones and the old bundle as a version, and goes back to draft', async () => {
    const venue = { ...mockMaps[0], zones: [{ zone_id: 'z', map_id: mockMaps[0].map_id, kind: 'no_go' as const, label: 'Stairs', polygon: [[0, 0], [1, 0], [1, 1]] as [number, number][] }] }
    const { pipeline, maps, advance } = setup([venue])
    const queued = await pipeline.uploadSurvey(survey({ mapId: venue.map_id, name: 'Venue' }))
    expect(queued.detail).toMatchObject({ replaces: true })
    advance(6000)
    pipeline.settle()
    expect(maps.get(venue.map_id)).toMatchObject({ status: 'draft', zones: venue.zones })
    expect(pipeline.listVersions(venue.map_id).map((v) => [v.version, v.current])).toEqual([[3, true], [2, false], [1, false]])
  })

  it('refuses an upload over the size limit and honours a cancel', async () => {
    const { pipeline } = setup()
    const huge = { size: 2 * 1024 ** 3, slice: () => new Blob([]) } as unknown as Blob
    await expect(pipeline.uploadSurvey(survey({ cloud: huge }))).rejects.toMatchObject({ status: 413 })
    const controller = new AbortController()
    controller.abort()
    await expect(pipeline.uploadSurvey(survey(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('the mock quality gate', () => {
  it("seeds the sample with a current, failed report: its free area is under 10 m²", () => {
    const { pipeline } = setup()
    const report = pipeline.getQuality(mockMaps[0].map_id)!
    expect(report).toMatchObject({ passed: false, current: true, failed: ['free_area_m2'] })
    const area = report.checks.find((c) => c.id === 'free_area_m2')!
    expect(area).toMatchObject({ status: 'fail', comparison: 'min', threshold: 10, blocking: true })
    expect(area.value).toBeCloseTo(4.5)
  })

  it('refuses to freeze a failed draft without an override, with the backend codes', () => {
    const { pipeline } = setup()
    const draft = { ...mockMaps[0], status: 'draft' as const }
    let caught: unknown = null
    try { pipeline.freezeGate(draft, 'active') } catch (e) { caught = e }
    expect(freezeRefusalOf(caught)).toMatchObject({ code: 'quality_failed', failed: ['free_area_m2'] })
    expect(() => pipeline.freezeGate(draft, 'active', { reason: 'corridor only' })).not.toThrow()
    // Archiving, and re-sending active for an active map, are not freezes.
    expect(() => pipeline.freezeGate(draft, 'archived')).not.toThrow()
    expect(() => pipeline.freezeGate(mockMaps[0], 'active')).not.toThrow()
  })

  it('a restore makes the report stale until the queued check has run, and stale cannot be overridden', () => {
    const { pipeline, maps, advance } = setup()
    const restored = pipeline.restore(mockMaps[0].map_id, 1)
    expect(restored.status).toBe('draft')
    expect(pipeline.getQuality(restored.map_id)).toMatchObject({ current: false })
    let caught: unknown = null
    try { pipeline.freezeGate(restored, 'active', { reason: 'x' }) } catch (e) { caught = e }
    expect(freezeRefusalOf(caught)?.code).toBe('quality_stale')
    const running = pipeline.listJobs(restored.map_id)[0]
    expect(running).toMatchObject({ kind: 'quality', status: 'queued' })
    // A check asked for while one is queued joins it.
    expect(pipeline.recheck(restored.map_id).job_id).toBe(running.job_id)
    advance(2000)
    expect(pipeline.getJob(running.job_id).status).toBe('succeeded')
    expect(pipeline.getQuality(restored.map_id)).toMatchObject({ current: true, version: 3 })
    expect(pipeline.listVersions(restored.map_id).map((v) => [v.version, v.source, v.restored_from])).toEqual([
      [3, 'restore', 1], [2, 'survey', null], [1, 'upload', null],
    ])
    expect(maps.get(restored.map_id)?.status).toBe('draft')
  })

  it('a map with no report is refused as quality_missing', () => {
    const { pipeline } = setup([])
    const bare: SiteMap = { ...mockMaps[0], map_id: 'map-bare', status: 'draft' }
    const fresh = new MockMapPipeline({ get: () => bare, put: () => {} })
    // Seeded maps carry a report; drop it to stand in for one that never ran.
    ;(fresh as unknown as { records: Map<string, { live: { quality: unknown } }> }).records
      .set('map-bare', { live: { quality: null, version: 1 } as never, kept: [] } as never)
    let caught: unknown = null
    try { fresh.freezeGate(bare, 'active') } catch (e) { caught = e }
    expect(freezeRefusalOf(caught)?.code).toBe('quality_missing')
    expect(() => pipeline.restore('map-nowhere', 1)).toThrow(ApiError)
  })

  it('mockQualityReport fails a floor with too little free area and warns without a planning grid', () => {
    const r = mockQualityReport(mockMaps[0], 2, '2026-11-16T00:00:00Z')
    expect(r.failed).toEqual(['free_area_m2'])
    expect(r.warnings).toEqual(['planning_grid'])
    expect(r.checks.find((c) => c.id === 'path_coverage')?.status).toBe('skipped')
  })
})

describe('the mock data provider wires the pipeline', () => {
  it('lists a surveyed map once its job has run, and freezes it because its report passed', async () => {
    const provider = new MockDataProvider()
    // A pipeline on a clock that moves 10 s per look, with an instant upload,
    // swapped in for the provider's own.
    let calls = 0
    const pipeline = new MockMapPipeline({
      get: (id) => (provider as unknown as { editedMaps: Map<string, SiteMap> }).editedMaps.get(id) ?? null,
      put: (m) => { (provider as unknown as { editedMaps: Map<string, SiteMap> }).editedMaps.set(m.map_id, m) },
    }, { uploadStepMs: 0, now: () => Date.parse('2026-11-16T05:00:00Z') + 10_000 * calls++ })
    ;(provider as unknown as { mapPipeline: MockMapPipeline }).mapPipeline = pipeline
    const queued = await provider.uploadSurvey(survey())
    expect((await provider.getMapJob(queued.job_id)).status).toBe('succeeded')
    const maps = await provider.listMaps('site-north-yard')
    expect(maps.map((m) => m.map_id)).toContain('map-office')
    expect(await provider.getMapQuality('map-office')).toMatchObject({ passed: true })
    expect((await provider.setMapStatus('map-office', 'active')).status).toBe('active')
    expect((await provider.listMapVersions('map-office'))[0]).toMatchObject({ current: true, version: 1 })
  })
})

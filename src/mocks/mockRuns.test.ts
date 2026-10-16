import { describe, expect, it } from 'vitest'
import { mockDataProvider } from './mockDataProvider'

describe('mock runs', () => {
  it('lists sample runs for the site, newest first, marked as samples', async () => {
    const page = await mockDataProvider.listRuns({ site_id: 'site-north-yard' })
    expect(page.sample).toBe(true)
    expect(page.items.length).toBeGreaterThan(0)
    const starts = page.items.map((r) => r.started_at)
    expect([...starts].sort().reverse()).toEqual(starts)
    expect(page.items.every((r) => r.site_id === 'site-north-yard')).toBe(true)
  })
  it('returns detail and ordered events with media paths inside the folder layout', async () => {
    const [first] = (await mockDataProvider.listRuns({ site_id: 'site-north-yard' })).items
    const detail = await mockDataProvider.getRun(first.run_id)
    expect(detail.files.some((f) => f.path.startsWith('video/run_'))).toBe(true)
    const events = await mockDataProvider.getRunEvents(first.run_id)
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i))
    const times = events.map((e) => Date.parse(e.at))
    expect(times).toEqual([...times].sort((x, y) => x - y))
    for (const e of events) if (e.media) expect(e.media).toMatch(/^(photos|video|audio|detections)\/[^/]+$/)
    expect(mockDataProvider.runZipUrl(first.run_id)).toBeNull()
  })
})

describe('browser-made runs', () => {
  it('appear in listRuns and detail, with events deduped by seq', async () => {
    const run = { run_id: 'made-1', mission_id: 'm', robot_id: 'r', site_id: 'site-north-yard', started_at: new Date().toISOString(), ended_at: null, result: 'running', started_by: 'op', end_reason: null, bucket_copied_at: null, mission: {} } as never
    await mockDataProvider.putRun(run)
    const ev = { run_id: 'made-1', seq: 0 } as never
    await mockDataProvider.postRunEvents('made-1', [ev])
    await mockDataProvider.postRunEvents('made-1', [ev])
    const page = await mockDataProvider.listRuns({ site_id: 'site-north-yard' })
    expect(page.sample).toBe(true)
    expect(page.items.some((r) => r.run_id === 'made-1')).toBe(true)
    expect((await mockDataProvider.getRun('made-1')).event_count).toBe(1)
  })
})

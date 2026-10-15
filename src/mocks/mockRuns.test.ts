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

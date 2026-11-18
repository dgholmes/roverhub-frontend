// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { MapJob, MapQualityReport, MapVersion } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'

const fake = vi.hoisted(() => ({
  listMaps: vi.fn(),
  getMap: vi.fn(),
  setMapStatus: vi.fn(),
  saveMapZones: vi.fn(),
  getMapQuality: vi.fn(),
  recheckMapQuality: vi.fn(),
  getMapJob: vi.fn(),
  listMapJobs: vi.fn(),
  listMapVersions: vi.fn(),
  restoreMapVersion: vi.fn(),
  uploadSurvey: vi.fn(),
  mapArtifactUrl: () => '',
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: fake }))
// The zone editor draws with Leaflet, which this test has no use for.
vi.mock('./ZoneEditor', () => ({ ZoneEditor: () => <div data-zone-editor="" /> }))
// Robot maps reads the robots from the LiveOps store; MapRobotsSection.test.tsx covers it.
vi.mock('./MapRobotsSection', () => ({ MapRobotsSection: () => <div data-robot-maps="" /> }))

import { ApiError } from '@/lib/realtime/apiError'
import { mockMaps } from '@/mocks/maps'
import { mockQualityReport } from '@/mocks/mapPipeline'
import { useSessionStore } from '@/store/useSessionStore'
import type { SiteRole } from '@/org/roles'
import { FreezeControl, MapCurationPanel, qualityObstacle } from './MapCurationPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draft: SiteMap = { ...mockMaps[0], status: 'draft' }
const failedReport = (over: Partial<MapQualityReport> = {}): MapQualityReport =>
  ({ ...mockQualityReport(draft, 2, '2026-11-16T05:00:00Z'), current: true, ...over })
const versions: MapVersion[] = [
  { version: 2, current: true, source: 'survey', created_at: '2026-11-06T09:30:00Z', restored_from: null, detail: {},
    name: draft.name, updated_at: draft.updated_at, zones: 0, floors: [], quality: { passed: false, computed_at: null, failed: ['free_area_m2'] } },
  { version: 1, current: false, source: 'upload', created_at: '2026-11-04T09:30:00Z', restored_from: null, detail: {},
    name: draft.name, updated_at: draft.updated_at, zones: 0, floors: [], quality: null },
]
const job = (over: Partial<MapJob> = {}): MapJob => ({
  job_id: 'mjob-q', kind: 'quality', map_id: draft.map_id, site_id: draft.site_id, status: 'queued', stage: 'queued',
  created_at: '2026-11-16T05:00:00Z', started_at: null, finished_at: null, error: null, result: null, ...over,
})

let container: HTMLDivElement
let root: Root
const text = () => container.textContent ?? ''
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
async function until(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i++) await tick(10)
}
const buttons = (label: string) => [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)
const button = (label: string) => buttons(label)[0]

async function mount(role: SiteRole) {
  useSessionStore.setState({ role })
  act(() => root.render(<MapCurationPanel siteId={draft.site_id} />))
  await until(() => text().includes('Quality check') && text().includes('Version 1'))
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.listMaps.mockResolvedValue([draft])
  fake.getMapQuality.mockResolvedValue(failedReport())
  fake.listMapJobs.mockResolvedValue([])
  fake.listMapVersions.mockResolvedValue(versions)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the quality report on the Maps page', () => {
  it('shows each check against its limit, and whether the report is current', async () => {
    await mount('viewer')
    const row = (id: string) => container.querySelector<HTMLElement>(`[data-check="${id}"]`)!
    expect(row('free_area_m2').dataset.status).toBe('fail')
    expect(row('floor_tilt_deg').dataset.status).toBe('pass')
    expect(row('track_drift_p95_m').dataset.status).toBe('pass')
    expect(row('path_coverage').dataset.status).toBe('skipped')
    const cells = (id: string) => [...row(id).querySelectorAll('[role="cell"]')].map((c) => c.textContent)
    expect(cells('free_area_m2')).toEqual(['Free areaRequired', '4.5 m²', '≥ 10.0 m²', 'Fail'])
    expect(cells('floor_tilt_deg').slice(1)).toEqual(['0.06°', '≤ 1.00°', 'Pass'])
    expect(cells('track_drift_p95_m')).toEqual(['Vertical drift', '3.8 cm', '≤ 10.0 cm', 'Pass'])
    expect(cells('planning_grid').slice(1)).toEqual(['No', '', 'Warning'])
    expect(text()).toContain('Up to date')
    expect(text()).toContain('Failed: Free area')
    // A viewer may read it, but has nothing to press.
    expect(button('Check again')).toBeUndefined()
    expect(button('Freeze map')).toBeUndefined()
    expect(button('Restore')).toBeUndefined()
  })

  it('says when the report no longer describes the map', async () => {
    fake.getMapQuality.mockResolvedValue(failedReport({ current: false }))
    await mount('supervisor')
    expect(text()).toContain('Out of date')
    expect(text()).toContain('The map changed after this check ran')
    // ...and the freeze control already says why freezing will be refused.
    expect(container.querySelector('[data-obstacle="quality_stale"]')).not.toBeNull()
  })

  it('"Check again" queues a check and follows it until the new report is read', async () => {
    fake.recheckMapQuality.mockResolvedValue(job())
    fake.getMapJob.mockResolvedValue(job({ status: 'succeeded', stage: 'done' }))
    await mount('supervisor')
    fake.getMapQuality.mockResolvedValue({ ...failedReport(), computed_at: '2026-11-16T06:00:00Z' })
    await act(async () => button('Check again').click())
    expect(fake.recheckMapQuality).toHaveBeenCalledWith(draft.map_id)
    expect(text()).toContain('Checking: waiting to start')
    await until(() => !text().includes('Checking:'))
    expect(fake.getMapQuality).toHaveBeenCalledTimes(2)
  })

  it('picks up a check the backend is already running (after an upload or a restore)', async () => {
    fake.listMapJobs.mockResolvedValue([job({ status: 'running', stage: 'checking quality' })])
    fake.getMapJob.mockResolvedValue(job({ status: 'running', stage: 'checking quality' }))
    await mount('viewer')
    await until(() => text().includes('Checking: checking quality'))
    expect(text()).toContain('Checking: checking quality')
  })
})

describe('freezing through the quality gate', () => {
  const refusal = () => new ApiError(409, { detail: {
    code: 'quality_failed', failed: ['free_area_m2'],
    message: 'the quality report failed (free_area_m2); freezing it anyway needs an override',
  } }, 'PUT /maps/status answered 409')

  it("shows the backend's reason, and a supervisor can override with a reason", async () => {
    fake.setMapStatus.mockRejectedValueOnce(refusal()).mockResolvedValueOnce({ ...draft, status: 'active' })
    await mount('supervisor')
    await act(async () => button('Freeze map').click())
    await until(() => text().includes('Server:'))
    expect(text()).toContain("The quality check failed: Free area. Freezing it anyway needs a supervisor's override.")
    expect(text()).toContain('Server: the quality report failed (free_area_m2)')

    await act(async () => button('Freeze anyway…').click())
    const confirm = button('Freeze with override')
    expect(confirm.disabled).toBe(true)  // no reason, no override
    const area = container.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'Only the corridor was surveyed.')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button('Freeze with override').disabled).toBe(false)
    await act(async () => button('Freeze with override').click())
    await until(() => text().includes('Frozen.'))
    expect(fake.setMapStatus).toHaveBeenLastCalledWith(draft.map_id, 'active', { reason: 'Only the corridor was surveyed.' })
  })

  it('a role without override sees the refusal but no override', () => {
    const html = renderToStaticMarkup(
      <FreezeControl map={draft} busy={false} onFreeze={() => {}} quality={failedReport()}
        refusal={{ code: 'quality_failed', failed: ['free_area_m2'], message: 'm' }} canOverride={false} onOverride={() => {}} />,
    )
    expect(html).toContain('The quality check failed: Free area')
    expect(html).not.toContain('Freeze anyway')
  })

  it('a missing or stale report offers a check, never an override', () => {
    const html = renderToStaticMarkup(
      <FreezeControl map={draft} busy={false} onFreeze={() => {}} quality={null}
        canOverride onOverride={() => {}} canRecheck onRecheck={() => {}} />,
    )
    expect(html).toContain('has not been quality-checked yet')
    expect(html).toContain('Check now')
    expect(html).not.toContain('Freeze anyway')
  })

  it('qualityObstacle reads the report as the backend gate does', () => {
    expect(qualityObstacle(undefined)).toBeNull()
    expect(qualityObstacle(null)).toBe('quality_missing')
    expect(qualityObstacle(failedReport({ current: false }))).toBe('quality_stale')
    expect(qualityObstacle(failedReport())).toBe('quality_failed')
    expect(qualityObstacle(failedReport({ passed: true, failed: [] }))).toBeNull()
  })
})

describe('versions', () => {
  it('lists versions newest first with the current one marked', async () => {
    await mount('viewer')
    const items = [...container.querySelectorAll<HTMLElement>('[data-version]')]
    expect(items.map((li) => li.dataset.version)).toEqual(['2', '1'])
    expect(items[0].textContent).toContain('Current')
    expect(items[0].textContent).toContain('Survey upload')
    expect(items[1].textContent).not.toContain('Current')
  })

  it('an engineer restores a version after confirming in the page, never with window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const restored = { ...draft, updated_at: '2026-11-16T07:00:00Z' }
    fake.restoreMapVersion.mockResolvedValue(restored)
    await mount('engineer')
    expect(buttons('Restore')).toHaveLength(1)  // not on the current one
    await act(async () => button('Restore').click())
    expect(text()).toContain('Restore version 1? It becomes the current version again')
    await act(async () => button('Restore version 1').click())
    await until(() => fake.listMapVersions.mock.calls.length >= 2)
    expect(fake.restoreMapVersion).toHaveBeenCalledWith(draft.map_id, 1)
    expect(confirmSpy).not.toHaveBeenCalled()
    // The map's files changed: its report and versions are read again.
    expect(fake.getMapQuality.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('a refused restore says why and keeps the confirmation open', async () => {
    fake.restoreMapVersion.mockRejectedValue(new ApiError(404, { detail: 'map map-venue-survey has no version 1' }, 'x'))
    await mount('engineer')
    await act(async () => button('Restore').click())
    await act(async () => button('Restore version 1').click())
    await until(() => text().includes('Could not restore'))
    expect(text()).toContain('Could not restore: map map-venue-survey has no version 1')
  })

  it('cancelling the confirmation restores nothing', async () => {
    await mount('engineer')
    await act(async () => button('Restore').click())
    await act(async () => button('Cancel').click())
    expect(fake.restoreMapVersion).not.toHaveBeenCalled()
    expect(text()).not.toContain('Restore version 1?')
  })
})

describe('the survey upload entry point', () => {
  it('is offered to the engineer (configure) and not to the supervisor', async () => {
    await mount('engineer')
    expect(button('New map from survey')).toBeDefined()
    act(() => root.unmount())
    root = createRoot(container)
    await mount('supervisor')
    expect(button('New map from survey')).toBeUndefined()
  })

  it('a site with no maps says who can upload one', async () => {
    fake.listMaps.mockResolvedValue([])
    useSessionStore.setState({ role: 'supervisor' })
    act(() => root.render(<MapCurationPanel siteId={draft.site_id} />))
    await until(() => text().includes('No surveyed map'))
    expect(text()).toContain('needs the Engineer role')
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { MapJob, MapQualityReport, MapVersion } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'

// The Map workspace with everything it composes, except what draws with
// Leaflet or reads robots: those have their own tests. Moved here from
// MapCurationPanel.pipeline.test.tsx when Missions › Maps became the Map
// workspace (2026-11-26): every behaviour pinned there is pinned here, against
// the tab that now holds it.

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
  trimFloor: vi.fn(),
  renameMap: vi.fn(),
  listMissions: vi.fn(async () => []),
  getRobots: vi.fn((): unknown[] => []),
  subscribeTelemetry: vi.fn(() => () => {}),
  mapArtifactUrl: () => '',
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: fake }))
// The LiveOps store is only started and stopped here.
vi.mock('@/store/useLiveOpsStore', () => {
  const state = { init: () => {}, teardown: () => {} }
  return { useLiveOpsStore: (select: (s: typeof state) => unknown) => select(state) }
})
// The centre map draws with Leaflet (MapPlanView); here it says whether a
// zone is being drawn on it.
vi.mock('./MapPlanView', () => ({
  MapPlanView: (p: { draft: { drawing: unknown } }) => <div data-map-plan="" data-drawing={String(!!p.draft.drawing)} />,
}))
// The zone list echoes how the page asked it to be read-only, which the screen
// size cases pin; ZoneEditor.test.tsx covers the list itself.
const zones = vi.hoisted(() => ({ stopDrawing: () => {}, startDrawing: () => {} }))
vi.mock('./ZoneEditor', () => ({
  useZoneDraft: () => ({ zones: [], drawing: null, stopDrawing: zones.stopDrawing, startDrawing: zones.startDrawing }),
  ZonePanel: (p: { readOnly?: boolean; readOnlyReason?: string }) => (
    <div data-zone-editor="" data-read-only={String(!!p.readOnly)} data-reason={p.readOnlyReason ?? ''} />
  ),
}))
// A fine pointer and a wide screen unless a test says otherwise.
const shell = vi.hoisted(() => ({ touch: false, narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'landscape' as const, big: true, narrow: shell.narrow }),
}))
// Robot maps reads the robots itself; MapRobotsSection.test.tsx covers it.
// Here it shows which robot's question the checklist asked it to open.
vi.mock('./MapRobotsSection', () => ({
  MapRobotsSection: (p: { ask?: { robotId: string; act: string } | null }) => (
    <ul data-robot-maps="" data-ask={p.ask ? `${p.ask.robotId}:${p.ask.act}` : ''}><li data-robot="rover-jetson" /><li data-robot="rover-pi" /></ul>
  ),
}))
// The checklist's steps read more than this page; MapReadyChecklist.test.tsx
// covers them. Here they are what the test says, and the rows hand their
// onAction to the test.
const ready = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
  onAction: null as null | ((a: unknown) => void),
  steps: [] as { id: string; tone: string }[],
  reads: { survey: undefined, summary: undefined, moved: undefined, walked: undefined } as Record<string, unknown>,
}))
vi.mock('./MapReadyChecklist', () => ({
  useMapReadiness: (props: Record<string, unknown>) => { ready.props = props; return { steps: ready.steps, reads: ready.reads } },
  MapReadyRows: (p: { steps: unknown[]; onAction: (a: unknown) => void }) => {
    ready.onAction = p.onAction
    return <div data-ready="" data-steps={p.steps.length} />
  },
}))
vi.mock('./editor/MapEditor', () => ({
  MapEditor: (p: { map: SiteMap; onClose: () => void }) => (
    <section data-map-editor={p.map.map_id}><button type="button" onClick={p.onClose}>Close editor</button></section>
  ),
}))
vi.mock('@/components/survey/SurveyPage', () => ({ SurveyPage: () => <div data-survey-page="" /> }))

import { ApiError } from '@/lib/realtime/apiError'
import { mockMaps } from '@/mocks/maps'
import { mockQualityReport } from '@/mocks/mapPipeline'
import { useSessionStore } from '@/store/useSessionStore'
import type { SiteRole } from '@/org/roles'
import type { ReadinessAction } from './mapReadiness'
import { FreezeControl, qualityObstacle } from './FreezeControl'
import { defaultMapTab, MapWorkspace } from './MapWorkspace'
import { hashForMap, hashForMapEditor, hashForMapSurvey, hashForMissionEditor, type MapTab } from '@/app/routes'
import { useMissionStore } from '@/missions/useMissionStore'
import type { MissionLibraryEntry } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draft: SiteMap = { ...mockMaps[0], status: 'draft' }
const site = draft.site_id
const zoned = {
  ...draft, zones: [{ zone_id: 'zone-1', kind: 'no_go', label: 'Stairs', floor_index: 0, polygon: [[0, 0], [1, 0], [1, 1]] }],
} as unknown as SiteMap
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
const panel = () => container.querySelector<HTMLElement>('[data-map-panel]')?.dataset.mapPanel
const tabButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === label)!
const openTab = (label: string) => act(async () => tabButton(label).click())
/** Setup is not a tab: the header's Ready chip opens it. */
const openSetup = () => act(async () => container.querySelector<HTMLButtonElement>('[data-ready-chip]')!.click())

/** Renders the workspace at `hash` (the draft, on the tab given, by default). */
async function mount(role: SiteRole, tab?: MapTab, hash = hashForMap(site, draft.map_id, tab)) {
  useSessionStore.setState({ role })
  window.history.replaceState(null, '', hash)
  act(() => root.render(<MapWorkspace siteId={site} />))
  await until(() => container.querySelector('h2') !== null && fake.listMapVersions.mock.calls.length > 0)
  await tick(20)
}

beforeEach(() => {
  vi.clearAllMocks()
  shell.touch = false
  shell.narrow = false
  ready.steps = []
  ready.reads = { survey: undefined, summary: undefined, moved: undefined, walked: undefined }
  fake.listMaps.mockResolvedValue([draft])
  fake.getMapQuality.mockResolvedValue(failedReport())
  fake.listMapJobs.mockResolvedValue([])
  fake.listMapVersions.mockResolvedValue(versions)
  fake.listMissions.mockResolvedValue([])
  useMissionStore.setState({ missions: [], siteId: null, loading: false })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.history.replaceState(null, '', '#/')
})

describe('the quality report (Quality tab)', () => {
  it('shows each check against its limit, and whether the report is current', async () => {
    await mount('viewer', 'quality')
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
    // A viewer may read it, but has nothing to press, on any tab.
    expect(button('Check again')).toBeUndefined()
    await openSetup()
    expect(button('Freeze map')).toBeUndefined()
    await openTab('Versions')
    expect(button('Restore')).toBeUndefined()
  })

  it('says when the report no longer describes the map', async () => {
    fake.getMapQuality.mockResolvedValue(failedReport({ current: false }))
    await mount('supervisor', 'quality')
    expect(text()).toContain('Out of date')
    expect(text()).toContain('The map changed after this check ran')
    // ...and Setup's freeze control already says why freezing will be refused.
    await openSetup()
    expect(container.querySelector('[data-obstacle="quality_stale"]')).not.toBeNull()
  })

  it('"Check again" queues a check and follows it until the new report is read', async () => {
    fake.recheckMapQuality.mockResolvedValue(job())
    fake.getMapJob.mockResolvedValue(job({ status: 'succeeded', stage: 'done' }))
    await mount('supervisor', 'quality')
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
    await mount('viewer', 'quality')
    await until(() => text().includes('Checking: checking quality'))
    expect(text()).toContain('Checking: checking quality')
  })

  it('is summarised once on Overview, which links to the Quality tab', async () => {
    await mount('viewer', 'overview')
    const summary = container.querySelector('[data-quality-summary]')!
    expect(summary.textContent).toBe('Failed: Free area')
    // The checks themselves are on the Quality tab only.
    expect(container.querySelector('[data-check]')).toBeNull()
    await act(async () => button('See the checks').click())
    expect(panel()).toBe('quality')
    expect(container.querySelector('[data-check="free_area_m2"]')).not.toBeNull()
  })
})

describe('freezing through the quality gate (Setup tab)', () => {
  const refusal = () => new ApiError(409, { detail: {
    code: 'quality_failed', failed: ['free_area_m2'],
    message: 'the quality report failed (free_area_m2); freezing it anyway needs an override',
  } }, 'PUT /maps/status answered 409')

  it("shows the backend's reason, and a supervisor can override with a reason", async () => {
    fake.setMapStatus.mockRejectedValueOnce(refusal()).mockResolvedValueOnce({ ...draft, status: 'active' })
    await mount('supervisor')
    expect(panel()).toBe('setup')
    await act(async () => button('Freeze map').click())
    // The draft has no zones: asked first, and answered "none needed".
    expect(text()).toContain('No zones are drawn. The lidar cannot see stairs, drops or glass at floor level.')
    expect(fake.setMapStatus).not.toHaveBeenCalled()
    await act(async () => button('Activate anyway (none needed)').click())
    await until(() => text().includes('Server:'))
    expect(fake.setMapStatus).toHaveBeenCalledWith(draft.map_id, 'active', { zonesReviewed: true })
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
    expect(fake.setMapStatus).toHaveBeenLastCalledWith(draft.map_id, 'active', { reason: 'Only the corridor was surveyed.', zonesReviewed: true })
    // Activated, the page stays on Setup rather than jumping to Overview.
    expect(panel()).toBe('setup')
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

describe('versions (Versions tab)', () => {
  it('lists versions newest first with the current one marked', async () => {
    await mount('viewer', 'versions')
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
    await mount('engineer', 'versions')
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
    await mount('engineer', 'versions')
    await act(async () => button('Restore').click())
    await act(async () => button('Restore version 1').click())
    await until(() => text().includes('Could not restore'))
    expect(text()).toContain('Could not restore: map map-venue-survey has no version 1')
  })

  it('cancelling the confirmation restores nothing', async () => {
    await mount('engineer', 'versions')
    await act(async () => button('Restore').click())
    await act(async () => button('Cancel').click())
    expect(fake.restoreMapVersion).not.toHaveBeenCalled()
    expect(text()).not.toContain('Restore version 1?')
  })

  it("Overview names the current version and the floor's content hash once", async () => {
    await mount('viewer', 'overview')
    expect(text()).toContain('v2')
    const hash = draft.floors[0].content_hash!
    expect(text().split(hash.slice(0, 12)).length - 1).toBe(1)
  })
})

describe('the survey entry points (header)', () => {
  it('upload is offered to the engineer (configure) and not to the supervisor', async () => {
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
    window.history.replaceState(null, '', hashForMap(site))
    act(() => root.render(<MapWorkspace siteId={site} />))
    await until(() => text().includes('No surveyed map'))
    expect(text()).toContain('needs the Engineer role')
  })

  it('Survey with a robot opens the Survey page under Map', async () => {
    await mount('viewer')
    await act(async () => button('Survey with a robot').click())
    expect(window.location.hash).toBe(hashForMapSurvey(site))
    expect(container.querySelector('[data-survey-page]')).not.toBeNull()
  })
})

describe('the Setup tab and its checklist', () => {
  const act_ = (action: ReadinessAction) => act(async () => { ready.onAction!(action) })

  /** Runs `fn` while recording what scrollIntoView was called on (jsdom has none). */
  async function scrolledBy(fn: () => Promise<unknown>): Promise<Element[]> {
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
    try { await fn() } finally { Element.prototype.scrollIntoView = original }
    return scrolled
  }

  it('is given the map, floor and quality report, and is not in the editor', async () => {
    await mount('viewer')
    expect(container.querySelector('[data-ready]')).not.toBeNull()
    expect(ready.props).toMatchObject({ map: draft, floorIndex: 0, qualityRunning: false })
  })

  it('See drift and Rebuild open the survey; Set position opens LiveOps on that robot', async () => {
    await mount('engineer')
    await act_({ kind: 'seeDrift', surveyId: 'survey-1' })
    expect(window.location.hash).toBe(`#/site/${site}/data/surveys/survey-1`)
    await act_({ kind: 'setPosition', robotId: 'rover-jetson' })
    expect(window.location.hash).toBe(`#/site/${site}/liveops`)
    expect(useSessionStore.getState().selectedRobotId).toBe('rover-jetson')
  })

  it('Check again queues a check in place; Draw zones opens the Zones tab, and nothing scrolls', async () => {
    fake.recheckMapQuality.mockResolvedValue(job())
    fake.getMapJob.mockResolvedValue(job({ status: 'running' }))
    await mount('supervisor')
    const scrolled = await scrolledBy(async () => {
      await act_({ kind: 'checkQuality' })
      expect(fake.recheckMapQuality).toHaveBeenCalledWith(draft.map_id)
      expect(panel()).toBe('setup')
      await act_({ kind: 'drawZones' })
    })
    expect(panel()).toBe('zones')
    expect(container.querySelector('[data-zone-editor]')).not.toBeNull()
    expect(window.location.hash).toBe(hashForMap(site, draft.map_id, 'zones'))
    expect(scrolled).toEqual([])
  })

  it('Activate freezes a map that has zones', async () => {
    fake.listMaps.mockResolvedValue([zoned])
    fake.setMapStatus.mockResolvedValue({ ...zoned, status: 'active' })
    await mount('supervisor')
    await act_({ kind: 'activate' })
    await until(() => text().includes('Frozen.'))
    expect(fake.setMapStatus).toHaveBeenCalledWith(draft.map_id, 'active', undefined)
  })

  it("Activate on a map with no zones asks first; the question's Draw zones opens Zones and sends nothing", async () => {
    await mount('supervisor')
    await act_({ kind: 'activate' })
    const ask = container.querySelector('[role="alertdialog"]')!
    expect(ask.textContent).toContain('No zones are drawn. The lidar cannot see stairs, drops or glass at floor level.')
    const scrolled = await scrolledBy(() => act(async () => button('Draw zones').click()))
    expect(scrolled).toEqual([])
    expect(panel()).toBe('zones')
    expect(fake.setMapStatus).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('asks again every time: activated, back to draft by an edit, activated again', async () => {
    fake.setMapStatus.mockResolvedValueOnce({ ...draft, status: 'active', updated_at: '2026-11-20T09:00:00Z' })
    fake.trimFloor.mockResolvedValueOnce({ ...draft, status: 'draft', updated_at: '2026-11-20T09:05:00Z' })
    await mount('supervisor')
    await act_({ kind: 'activate' })
    await act(async () => button('Activate anyway (none needed)').click())
    await until(() => text().includes('Frozen.'))
    expect(fake.setMapStatus).toHaveBeenCalledWith(draft.map_id, 'active', { zonesReviewed: true })
    // An edit makes a new draft version (here a trim).
    await act_({ kind: 'trim', floorIndex: 0 })
    await act(async () => button('Trim').click())
    await until(() => !text().includes('Frozen.'))
    expect(text()).not.toContain('Frozen.')
    await act_({ kind: 'activate' })
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('No zones are drawn.')
    expect(fake.setMapStatus).toHaveBeenCalledTimes(1)
  })

  it('opens the same question when the backend refuses for zones', async () => {
    fake.listMaps.mockResolvedValue([zoned])
    fake.setMapStatus.mockRejectedValueOnce(new ApiError(409, { detail: { code: 'zones_unreviewed', message: 'no zones' } }, 'x'))
    await mount('supervisor')
    await act_({ kind: 'activate' })
    await until(() => container.querySelector('[role="alertdialog"]') !== null)
    expect(text()).toContain('Activate anyway (none needed)')
  })

  it('Trim asks first, then trims; a floor already inside says nothing changed', async () => {
    const trimmed = { ...draft, updated_at: '2026-11-20T09:00:00Z' }
    fake.trimFloor.mockResolvedValueOnce(trimmed).mockResolvedValueOnce(trimmed)
    await mount('supervisor')
    await act_({ kind: 'trim', floorIndex: 0 })
    expect(container.querySelector('[role="alertdialog"]')!.textContent).toContain('walked path plus 10 m')
    expect(fake.trimFloor).not.toHaveBeenCalled()
    await act(async () => button('Trim').click())
    await until(() => text().includes('as a new version'))
    expect(text()).toContain('Trimmed to 10 m around the walked path, as a new version.')
    expect(fake.trimFloor).toHaveBeenCalledWith(draft.map_id, 0)
    await act_({ kind: 'trim', floorIndex: 0 })
    await act(async () => button('Trim').click())
    await until(() => text().includes('Nothing changed'))
    expect(text()).toContain('Already within 10 m of the walked path. Nothing changed.')
  })

  it("Send to robot and Use this map open that robot's question on Overview, without scrolling", async () => {
    await mount('engineer')
    const scrolled = await scrolledBy(async () => {
      await act_({ kind: 'sendToRobot', robotId: 'rover-pi' })
      expect(panel()).toBe('overview')
      expect(container.querySelector<HTMLElement>('[data-robot-maps]')!.dataset.ask).toBe('rover-pi:send')
      await openSetup()
      await act_({ kind: 'useOnRobot', robotId: 'rover-jetson', robotName: 'rover-jetson' })
    })
    expect(panel()).toBe('overview')
    expect(container.querySelector<HTMLElement>('[data-robot-maps]')!.dataset.ask).toBe('rover-jetson:use')
    expect(scrolled).toEqual([])
  })

  it('Find moving things again opens the map editor', async () => {
    await mount('engineer')
    await act_({ kind: 'findMoving', surveyId: 's1', robotId: 'rover-pi' })
    expect(window.location.hash).toBe(hashForMapEditor(site, draft.map_id))
    expect(container.querySelector('[data-map-editor]')).not.toBeNull()
  })

  it('the questions take focus, and Escape puts them away', async () => {
    await mount('supervisor')
    await act_({ kind: 'trim', floorIndex: 0 })
    expect(document.activeElement?.textContent).toBe('Cancel')
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(fake.trimFloor).not.toHaveBeenCalled()

    await act_({ kind: 'activate' })
    const ask = container.querySelector('[role="alertdialog"]')!
    expect(ask.contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.textContent).toBe('Draw zones')
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(fake.setMapStatus).not.toHaveBeenCalled()
  })

  it('an answer to the zones question is dropped when another map is shown', async () => {
    const other = { ...draft, map_id: 'map-other', name: 'Other' }
    fake.listMaps.mockResolvedValue([draft, other])
    fake.setMapStatus.mockRejectedValue(new ApiError(409, { detail: {
      code: 'quality_failed', failed: ['free_area_m2'], message: 'needs an override',
    } }, 'x'))
    await mount('supervisor')
    await act_({ kind: 'activate' })
    await act(async () => button('Activate anyway (none needed)').click())
    await until(() => text().includes('Server:'))
    const pick = (id: string) => act(async () => container.querySelector<HTMLButtonElement>(`[data-map-id="${id}"]`)!.click())
    await pick(other.map_id)
    await pick(draft.map_id)
    await tick(20)
    await act_({ kind: 'activate' })
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('No zones are drawn.')
    expect(fake.setMapStatus).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when Trim is cancelled', async () => {
    await mount('supervisor')
    await act_({ kind: 'trim', floorIndex: 0 })
    await act(async () => button('Cancel').click())
    expect(fake.trimFloor).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })
})

describe('Rename', () => {
  const type = (el: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const openRename = () => act(async () => (container.querySelector('[aria-label="Rename the map and its floors"]') as HTMLElement).click())

  it("the header's pencil opens it on Overview; it renames the map and a floor label, sending only what changed", async () => {
    fake.renameMap.mockResolvedValue({ ...draft, name: 'Office 2F', floors: [{ ...draft.floors[0], label: '2F' }] })
    await mount('supervisor')
    await openRename()
    expect(panel()).toBe('overview')
    await type(container.querySelector<HTMLInputElement>('input[name="map-name"]')!, 'Office 2F')
    await type(container.querySelector<HTMLInputElement>('input[name="floor-0"]')!, '2F')
    await act(async () => button('Save names').click())
    await until(() => !container.querySelector('input[name="map-name"]'))
    expect(fake.renameMap).toHaveBeenCalledWith(draft.map_id, { name: 'Office 2F', floors: [{ index: 0, label: '2F' }] })
    expect(container.querySelector('h2')?.textContent).toBe('Office 2F')
  })

  it("Overview's Rename opens the same form", async () => {
    await mount('supervisor', 'overview')
    await act(async () => button('Rename').click())
    expect(container.querySelector('input[name="map-name"]')).not.toBeNull()
  })

  it('is for supervisors: a viewer gets no rename', async () => {
    await mount('viewer', 'overview')
    expect(container.querySelector('[aria-label="Rename the map and its floors"]')).toBeNull()
    expect(button('Rename')).toBeUndefined()
  })

  it('says why a rename was refused', async () => {
    fake.renameMap.mockRejectedValue(new ApiError(422, { detail: 'a floor label is at most 40 characters' }, 'x'))
    await mount('supervisor')
    await openRename()
    await type(container.querySelector<HTMLInputElement>('input[name="map-name"]')!, 'New')
    await act(async () => button('Save names').click())
    await until(() => text().includes('Not renamed'))
    expect(text()).toContain('Not renamed: a floor label is at most 40 characters')
  })
})

// The zone editor is a click-by-click polygon tool and the map editor behind
// "Edit map" is brushed; both need room. On a narrow screen (a phone) they open
// to read and "Edit map" is not offered. A tablet is a touch screen with room,
// and edits like a desktop.
describe('the Map page by screen size', () => {
  const zoneEditor = () => container.querySelector<HTMLElement>('[data-zone-editor]')!

  // Zones are a supervisor's to change (`editZones`); an engineer configures.
  it('lets a supervisor edit zones on a touch tablet', async () => {
    shell.touch = true
    await mount('supervisor', 'zones')
    expect(zoneEditor().dataset.readOnly).toBe('false')
  })

  it('shows the zones to read on a narrow screen, and says the reason is the screen rather than the role', async () => {
    shell.touch = true
    shell.narrow = true
    await mount('supervisor', 'zones')
    expect(zoneEditor().dataset.readOnly).toBe('true')
    expect(zoneEditor().dataset.reason).toBe('touch')
  })

  it('still tells a viewer it is their role, on any screen', async () => {
    shell.touch = true
    shell.narrow = true
    await mount('viewer', 'zones')
    expect(zoneEditor().dataset.readOnly).toBe('true')
    expect(zoneEditor().dataset.reason).toBe('role')
  })

  it('offers "Edit map" on a touch tablet, with the wide layout', async () => {
    shell.touch = true
    await mount('engineer')
    expect(button('Edit map')).toBeDefined()
    expect(container.querySelector('[data-map-layout="wide"]')).not.toBeNull()
  })

  it('does not offer it on a narrow screen, whose editor could only say no', async () => {
    shell.narrow = true
    await mount('engineer')
    expect(button('Edit map')).toBeUndefined()
  })
})

describe('the narrow page: list, map, back', () => {
  const carPark: SiteMap = { ...mockMaps[1], site_id: site }
  beforeEach(() => { fake.listMaps.mockResolvedValue([draft, carPark]) })

  it('starts on the list, opens a map as a step, and Back returns to the list', async () => {
    shell.narrow = true
    useSessionStore.setState({ role: 'viewer' })
    window.history.replaceState(null, '', hashForMap(site))
    act(() => root.render(<MapWorkspace siteId={site} />))
    await until(() => container.querySelector('[data-map-step="list"]') !== null)
    expect(container.querySelector('[data-map-plan]')).toBeNull()
    const before = window.history.length
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-map-id="${carPark.map_id}"]`)!.click())
    await until(() => container.querySelector('[data-map-step="map"]') !== null)
    // A step for Back, so the phone's own Back returns to the list too.
    expect(window.history.length).toBe(before + 1)
    expect(window.location.hash).toBe(hashForMap(site, carPark.map_id))
    expect(container.querySelector('h2')?.textContent).toBe(carPark.name)
    // The map full width, with the panel's tabs under it.
    const plan = container.querySelector('[data-map-plan]')!
    const tabs = container.querySelector('[role="tablist"][aria-label="About this map"]')!
    expect(plan.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Back to the maps list"]')!.click())
    await until(() => container.querySelector('[data-map-step="list"]') !== null)
    expect(window.location.hash).toBe(hashForMap(site))
  })
})

describe('the default tab and the Ready chip', () => {
  it('opens a draft map on Setup and an active one on Overview', async () => {
    expect(defaultMapTab({ status: 'draft' })).toBe('setup')
    expect(defaultMapTab({ status: 'active' })).toBe('overview')
    await mount('viewer')
    expect(panel()).toBe('setup')
    act(() => root.unmount())
    root = createRoot(container)
    fake.listMaps.mockResolvedValue([{ ...draft, status: 'active' }])
    await mount('viewer')
    expect(panel()).toBe('overview')
  })

  it('counts the green steps, and opens Setup, keeping the tab in the address in place', async () => {
    ready.steps = [{ id: 'mapped', tone: 'green' }, { id: 'legs', tone: 'green' }, { id: 'moved', tone: 'amber' }]
    fake.listMaps.mockResolvedValue([{ ...draft, status: 'active' }])
    await mount('viewer')
    const chip = container.querySelector<HTMLButtonElement>('[data-ready-chip]')!
    expect(chip.textContent).toContain('Ready 2/3')
    const before = window.history.length
    await act(async () => chip.click())
    expect(panel()).toBe('setup')
    expect(window.location.hash).toBe(hashForMap(site, draft.map_id, 'setup'))
    expect(window.history.length).toBe(before)
  })

  it('opens the tab the address names', async () => {
    await mount('viewer', 'versions')
    expect(panel()).toBe('versions')
    expect(tabButton('Versions').getAttribute('aria-selected')).toBe('true')
  })
})

describe('Edit map', () => {
  it('opens the editor over the page at /map/{id}/edit, and closing returns to the page', async () => {
    await mount('engineer')
    await act(async () => button('Edit map').click())
    expect(window.location.hash).toBe(hashForMapEditor(site, draft.map_id))
    expect(container.querySelector(`[data-map-editor="${draft.map_id}"]`)).not.toBeNull()
    expect(container.querySelector('[data-map-plan]')).toBeNull()
    await act(async () => button('Close editor').click())
    expect(window.location.hash).toBe(hashForMap(site, draft.map_id))
    expect(container.querySelector('[data-map-plan]')).not.toBeNull()
  })

  it('a link to the editor (a finished survey) opens it', async () => {
    await mount('engineer', undefined, hashForMapEditor(site, draft.map_id))
    expect(container.querySelector('[data-map-editor]')).not.toBeNull()
  })
})

describe('a map named by the address (a mission map chip links here)', () => {
  const carPark: SiteMap = { ...mockMaps[1], site_id: draft.site_id }
  const route = (id: string, name: string, mapId: string | null, kind: 'route' | 'program' = 'route') =>
    ({ mission_id: id, name, kind, map_id: mapId, site_id: draft.site_id } as unknown as MissionLibraryEntry)
  beforeEach(() => {
    fake.listMaps.mockResolvedValue([draft, carPark])
    useMissionStore.setState({ missions: [], siteId: draft.site_id, loading: false })
  })

  it('opens on that map rather than the one the site would pick', async () => {
    await mount('viewer', undefined, hashForMap(site, carPark.map_id))
    expect(container.querySelector('h2')?.textContent).toBe(carPark.name)
    expect(container.querySelector(`[data-map-id="${carPark.map_id}"]`)!.getAttribute('aria-current')).toBe('true')
  })

  it('lists every map, and puts one picked from the list in the address, in place', async () => {
    await mount('viewer')
    expect([...container.querySelectorAll<HTMLElement>('[data-map-id]')].map((b) => b.dataset.mapId)).toEqual([draft.map_id, carPark.map_id])
    const before = window.history.length
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-map-id="${carPark.map_id}"]`)!.click())
    expect(window.location.hash).toBe(hashForMap(site, carPark.map_id))
    expect(window.history.length).toBe(before)
    expect(container.querySelector('h2')?.textContent).toBe(carPark.name)
  })

  it('follows Back / Forward to the map the address names', async () => {
    await mount('viewer')
    await act(async () => {
      window.history.replaceState(null, '', hashForMap(site, carPark.map_id))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await tick(20)
    expect(container.querySelector('h2')?.textContent).toBe(carPark.name)
  })

  it('names the routes drawn on the map on Overview, each linking to its editor', async () => {
    useMissionStore.setState({
      missions: [
        route('m1', 'Pictlab', draft.map_id), route('m2', 'Car park loop', carPark.map_id),
        route('m3', 'Greeting', null, 'program'),
      ],
    })
    await mount('viewer', 'overview')
    const line = container.querySelector('[data-testid="missions-on-map"]')!
    expect(line.textContent).toBe('Missions on this map: Pictlab')
    act(() => line.querySelector('button')!.click())
    expect(window.location.hash).toBe(hashForMissionEditor(draft.site_id, 'm1'))
  })

  it('says so when no mission is drawn on the map, and nothing before the library loads', async () => {
    useMissionStore.setState({ loading: true })
    await mount('viewer', 'overview')
    expect(container.querySelector('[data-testid="missions-on-map"]')).toBeNull()
    act(() => useMissionStore.setState({ loading: false }))
    expect(container.querySelector('[data-testid="missions-on-map"]')?.textContent).toBe('No missions are drawn on this map yet.')
  })

  it("Overview links the survey the floor was built from to Data › Surveys", async () => {
    ready.reads = { ...ready.reads, survey: { surveyId: 'survey-7' } }
    await mount('viewer', 'overview')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Built from survey survey-7')!
    expect(link.getAttribute('href')).toBe(`#/site/${site}/data/surveys/survey-7`)
  })
})

describe('the panel tabs', () => {
  it('are Overview, Zones, Quality and Versions; Setup is the Ready chip', async () => {
    await mount('viewer', 'overview')
    expect([...container.querySelectorAll('[role="tablist"][aria-label="About this map"] [role="tab"]')].map((b) => b.textContent))
      .toEqual(['Overview', 'Zones', 'Quality', 'Versions'])
    await openSetup()
    expect(panel()).toBe('setup')
    expect(container.querySelector('[role="tablist"][aria-label="About this map"] [aria-selected="true"]')).toBeNull()
    expect(container.querySelector('[data-ready-chip]')!.getAttribute('aria-pressed')).toBe('true')
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { MapQualityReport } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import type { SurveySummary } from '@/types/surveyReplay'
import type { ReadinessStep } from './mapReadiness'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { robots, perms, provider } = vi.hoisted(() => ({
  robots: { current: [] as unknown[] },
  perms: { configure: true, editZones: true },
  provider: {
    getFloorSurvey: vi.fn(),
    listMapJobs: vi.fn(),
    listSurveys: vi.fn(),
    getMovedLayer: vi.fn(),
    getMapFloorFile: vi.fn(),
    getRobots: () => robots.current,
    subscribeTelemetry: () => () => {},
  },
}))
vi.mock('@/org/useCan', () => ({ useCan: (id: 'configure' | 'editZones') => perms[id] ?? false }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { MapReadyChecklist, MapReadyRows } from './MapReadyChecklist'

const HASH = 'a'.repeat(64)
const SURVEY = 'survey-20261120-150812-c0de'
const map: SiteMap = {
  map_id: 'map-survey-1508', site_id: 'site-office', name: 'Survey 15:08', source: 'slam',
  extent_min: [-20, -10], extent_max: [38, 20], created_at: '', updated_at: 'u1', geodetic_anchor: null,
  status: 'draft', zones: [],
  floors: [{
    index: 0, label: 'Ground', floor_z_m: 0, resolution_m: 0.05, origin_xy_m: [-20, -10], size_cells: [1160, 600],
    free_cells: 1, occupied_cells: 1, unknown_cells: 1, content_hash: HASH,
  }],
}
const other: SiteMap = { ...map, map_id: 'map-office-survey2', name: 'map-office-survey2' }
const summary = {
  survey_id: SURVEY, name: 'Office 15:08', site_id: 'site-office', robot_id: 'rover-jetson', started_at: '', stopped_at: '',
  duration_s: 1020, floor_index: 0, map_id: map.map_id, cameras: 'none', recording_kept: true, map_take_id: null,
  take_count: 1, first_bad_s: null, has_legs: true, legs_m: 208,
} as unknown as SurveySummary
const quality: MapQualityReport = {
  report_version: 1, map_id: map.map_id, version: 1, computed_at: '', passed: true, failed: [], warnings: [], checks: [], current: true,
}
const jetson = {
  ...initialRobots[0], robot_id: 'rover-jetson', name: 'rover-jetson', site_id: 'site-office',
  // Standing, idle and connected: Use this map is not held back.
  abstract_state: 'STAND', active_run: null, control_owner: null, nav_goal: null,
  connectivity: { ...initialRobots[0].connectivity, bridge_state: 'connected' },
  bridge: {
    ...initialRobots[0].bridge!, schema_version: '0.0.29', last_heartbeat_at: new Date().toISOString(), nav_map_id: 'map-office-survey2', nav_map_hash: 'b'.repeat(64),
    nav_localised: true, recordings: [],
  },
} as RobotState

let host: HTMLDivElement
let root: Root
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() })
const row = (id: string) => host.querySelector<HTMLElement>(`[data-step="${id}"]`)!
const buttons = (scope: Element) => [...scope.querySelectorAll('button')]

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  robots.current = [jetson]
  perms.configure = true
  perms.editZones = true
  provider.getFloorSurvey.mockResolvedValue({ surveyId: SURVEY, robotId: 'rover-jetson' })
  provider.listMapJobs.mockResolvedValue([])
  provider.listSurveys.mockResolvedValue({ items: [summary], sample: false })
  provider.getMovedLayer.mockResolvedValue({ version: 1, source: 'survey', params: {}, blobs: [] })
  provider.getMapFloorFile.mockResolvedValue(new TextEncoder().encode('t,x,y,z\n0,-5,-4,0\n1,10,8,0\n').buffer)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe('MapReadyRows', () => {
  const steps: ReadinessStep[] = [
    { id: 'mapped', tone: 'green', detail: '17 min survey.', action: null },
    { id: 'trimmed', tone: 'amber', detail: 'Reaches 28 m past.', action: { kind: 'trim', floorIndex: 0 } },
    { id: 'onRobot', tone: 'grey', detail: 'rover-jetson runs X.', action: { kind: 'useOnRobot', robotId: 'rover-jetson', robotName: 'rover-jetson' } },
    { id: 'quality', tone: 'red', detail: '1 blocking check fails.', action: null },
  ]

  it('draws a row per step: tone, title, detail, and at most one button that emits its action', () => {
    const onAction = vi.fn()
    act(() => root.render(<MapReadyRows steps={steps} onAction={onAction} />))
    expect(host.textContent).toContain('Get it ready')
    expect(row('mapped').dataset.tone).toBe('green')
    expect(row('mapped').textContent).toContain('Recorded and mapped')
    expect(row('mapped').textContent).toContain('17 min survey.')
    expect(buttons(row('mapped'))).toHaveLength(0)
    expect(buttons(row('quality'))).toHaveLength(0)
    expect(buttons(row('trimmed')).map((b) => b.textContent)).toEqual(['Trim'])
    const use = buttons(row('onRobot'))
    expect(use.map((b) => b.textContent)).toEqual(['Use this map on rover-jetson'])
    act(() => use[0].click())
    expect(onAction).toHaveBeenCalledWith({ kind: 'useOnRobot', robotId: 'rover-jetson', robotName: 'rover-jetson' })
  })

  it('separates rows with tints, never hairline borders or stripes', () => {
    act(() => root.render(<MapReadyRows steps={steps} onAction={() => {}} />))
    for (const s of steps) {
      const el = row(s.id)
      expect(el.style.border).toBe('')
      expect(el.style.borderLeft).toBe('')
      expect(el.style.background).not.toBe('')
    }
  })

  it('names each tone for screen readers', () => {
    act(() => root.render(<MapReadyRows steps={steps} onAction={() => {}} />))
    expect(row('trimmed').querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Needs a look')
  })

  it('reads in Korean too', async () => {
    await i18n.changeLanguage('ko')
    try {
      act(() => root.render(<MapReadyRows steps={steps} onAction={() => {}} />))
      expect(host.textContent).toContain('사용 준비')
      expect(buttons(row('trimmed'))[0].textContent).toBe('정리')
    } finally {
      await act(async () => { await i18n.changeLanguage('en') })
    }
  })
})

describe('MapReadyChecklist', () => {
  it("loads what the steps need and shows today's map", async () => {
    const onAction = vi.fn()
    act(() => root.render(
      <MapReadyChecklist map={map} floorIndex={0} maps={[map, other]} quality={quality} qualityRunning={false} onAction={onAction} />,
    ))
    await settle()
    const tones = Object.fromEntries([...host.querySelectorAll<HTMLElement>('[data-step]')].map((el) => [el.dataset.step, el.dataset.tone]))
    expect(tones).toEqual({
      mapped: 'green', legs: 'green', moved: 'green', quality: 'green', trimmed: 'amber',
      zones: 'grey', active: 'grey', onRobot: 'grey', placed: 'grey',
    })
    expect(provider.listSurveys).toHaveBeenCalledWith({ site_id: 'site-office' })
    expect(provider.getMapFloorFile).toHaveBeenCalledWith(map.map_id, 0, 'track')
    const use = buttons(row('onRobot'))
    expect(use.map((b) => b.textContent)).toEqual(['Use this map on rover-jetson'])
  })

  it('keeps the rows while a save is read again, and starts over for another floor', async () => {
    const draw = (m: SiteMap, floorIndex = 0) => act(() => root.render(
      <MapReadyChecklist map={m} floorIndex={floorIndex} maps={[m, other]} quality={quality} qualityRunning={false} onAction={() => {}} />,
    ))
    draw(map)
    await settle()
    expect(row('legs').dataset.tone).toBe('green')
    // The next reads never answer: what is shown is what was held.
    const never = () => new Promise<never>(() => {})
    for (const f of [provider.getFloorSurvey, provider.listMapJobs, provider.getMovedLayer, provider.getMapFloorFile]) f.mockImplementation(never)
    draw({ ...map, updated_at: 'u2' })
    await settle()
    expect(row('legs').dataset.tone).toBe('green')
    expect(row('moved').dataset.tone).toBe('green')
    expect(row('trimmed').dataset.tone).toBe('amber')
    const twoFloors = { ...map, updated_at: 'u2', floors: [...map.floors, { ...map.floors[0], index: 1 }] }
    draw(twoFloors, 1)
    await settle()
    expect(row('legs').dataset.tone).toBe('grey')
    expect(row('moved').dataset.tone).toBe('grey')
  })

  it('stays grey, not green, when the reads fail', async () => {
    provider.getFloorSurvey.mockRejectedValue(new Error('down'))
    provider.listMapJobs.mockRejectedValue(new Error('down'))
    provider.listSurveys.mockRejectedValue(new Error('down'))
    provider.getMovedLayer.mockRejectedValue(new Error('down'))
    provider.getMapFloorFile.mockRejectedValue(new Error('down'))
    act(() => root.render(
      <MapReadyChecklist map={map} floorIndex={0} maps={[map]} quality={undefined} qualityRunning={false} onAction={() => {}} />,
    ))
    await settle()
    for (const id of ['legs', 'moved', 'quality', 'trimmed']) expect(row(id).dataset.tone).toBe('grey')
  })

  it('without configure: no Use this map button, and the row says why', async () => {
    perms.configure = false
    act(() => root.render(
      <MapReadyChecklist map={map} floorIndex={0} maps={[map, other]} quality={quality} qualityRunning={false} onAction={() => {}} />,
    ))
    await settle()
    expect(buttons(row('onRobot'))).toHaveLength(0)
    expect(row('onRobot').textContent).toMatch(/engineer role/)
  })
})

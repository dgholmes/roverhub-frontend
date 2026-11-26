// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import i18n from '@/i18n'
import type { MapJob } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'

const fake = vi.hoisted(() => ({
  getMapFloorFile: vi.fn(),
  getMovedLayer: vi.fn(),
  putMapPlanning: vi.fn(),
  postCloudEdits: vi.fn(),
  getMapJob: vi.fn(),
  getMap: vi.fn(),
  listMaps: vi.fn(),
  getMapQuality: vi.fn(),
  listMapJobs: vi.fn(),
  listMapVersions: vi.fn(),
  mapArtifactUrl: () => '',
  // The Find moving panel: the robots, and the survey status that reports a search.
  getRobots: vi.fn((): unknown[] => []),
  // No survey.json record: the panel falls back to the map's jobs.
  getFloorSurvey: vi.fn(async () => undefined),
  subscribeTelemetry: vi.fn(() => () => {}),
  subscribeSurveyStatus: vi.fn(() => () => {}),
  // The Map workspace's Missions on this map reads the library.
  listMissions: vi.fn(async () => []),
}))
// Robot maps reads the robots from the LiveOps store; MapRobotsSection.test.tsx covers it.
vi.mock('../MapRobotsSection', () => ({ MapRobotsSection: () => null }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: fake }))
const noop = vi.hoisted(() => () => {})
vi.mock('../ZoneEditor', () => ({
  ZoneEditor: () => <div data-zone-editor="" />,
  ZonePanel: () => <div data-zone-editor="" />,
  useZoneDraft: () => ({ zones: [], drawing: null, stopDrawing: noop }),
}))
// The Map workspace's centre map draws with Leaflet, and its store is only started and stopped.
vi.mock('../MapPlanView', () => ({ MapPlanView: () => <div data-map-plan="" /> }))
vi.mock('@/store/useLiveOpsStore', () => {
  const state = { init: () => {}, teardown: () => {} }
  return { useLiveOpsStore: (select: (s: typeof state) => unknown) => select(state) }
})
const findMovingCommand = vi.hoisted(() => vi.fn())
vi.mock('@/sensors/sensorCommands', () => ({ findMoving: findMovingCommand }))

import { parsePgm } from '@/missions/floorCells'
import { demoFloorFiles } from '@/mocks/mapEditDemo'
import { mockMaps } from '@/mocks/maps'
import { useSessionStore } from '@/store/useSessionStore'
import type { SiteRole } from '@/org/roles'
import { MapWorkspace } from '../MapWorkspace'
import { encodePgm } from './gridEdit'
import { MapEditor, SHOW_MOVED_KEY } from './MapEditor'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// A small floor: 60 x 50 cells of 10 cm.
const floor = { ...mockMaps[0].floors[0], size_cells: [60, 50] as [number, number], resolution_m: 0.1, origin_xy_m: [0, 0] as [number, number] }
const map: SiteMap = { ...mockMaps[0], status: 'active', floors: [floor] }
const files = demoFloorFiles(floor)
const job = (over: Partial<MapJob> = {}): MapJob => ({
  job_id: 'mjob-e', kind: 'cloud_edits', map_id: map.map_id, site_id: map.site_id, status: 'queued', stage: 'queued',
  created_at: '', started_at: null, finished_at: null, error: null, result: null, ...over,
})

let container: HTMLDivElement
let root: Root
const text = () => container.textContent ?? ''
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick(10)
}
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
const click = (el: Element | undefined) => act(async () => { (el as HTMLElement).click() })
const row = (id: string) => container.querySelector<HTMLElement>(`[data-blob="${id}"]`)!
const rowButton = (id: string, label: string) => [...row(id).querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

beforeEach(() => {
  vi.clearAllMocks()
  void i18n.changeLanguage('en')
  // jsdom has no 2D canvas; the editor draws nothing then, which these tests do not need.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
  fake.getMapFloorFile.mockImplementation(async (_m: string, _f: number, kind: string) =>
    kind === 'grid' ? encodePgm(60, 50, files.grid).slice().buffer : null)
  fake.getMovedLayer.mockResolvedValue(files.moved)
  fake.getMap.mockResolvedValue({ ...map, status: 'draft', updated_at: '2026-11-16T08:00:00Z' })
  fake.postCloudEdits.mockResolvedValue(job())
  fake.getMapJob.mockResolvedValue(job({ status: 'succeeded', stage: 'saving a new version', result: { points_removed: 120,
    planning: { rerasterised: true, freed_cells: 9, kept_no_evidence_cells: 2 } } }))
  fake.putMapPlanning.mockResolvedValue(map)
  fake.listMaps.mockResolvedValue([map])
  fake.getMapQuality.mockResolvedValue(null)
  fake.listMapJobs.mockResolvedValue([])
  fake.listMapVersions.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function mountEditor(role: SiteRole, props: { onClose?: () => void; onSaved?: (m: SiteMap) => void } = {}) {
  useSessionStore.setState({ role })
  act(() => root.render(
    <MapEditor map={map} floorIndex={floor.index} pollMs={0} onClose={props.onClose ?? (() => {})} onSaved={props.onSaved ?? (() => {})} />,
  ))
  await until(() => text().includes('Spot 6') || text() === '')
}

describe('who sees the map editor', () => {
  it('is for engineers and supervisors only', async () => {
    for (const role of ['viewer', 'operator', 'technician'] as const) {
      await mountEditor(role)
      expect(text()).toBe('')
    }
    for (const role of ['engineer', 'supervisor'] as const) {
      await mountEditor(role)
      expect(text()).toContain('Probably moved')
    }
  })

  it('offers "Edit map" in the Map workspace only to them', async () => {
    for (const [role, shown] of [['viewer', false], ['operator', false], ['engineer', true], ['supervisor', true]] as const) {
      useSessionStore.setState({ role })
      act(() => root.render(<MapWorkspace siteId={map.site_id} />))
      await until(() => text().includes(map.name))
      expect(!!button('Edit map')).toBe(shown)
    }
  })
})

describe('the review list', () => {
  it('lists the moved spots biggest first with how often they were seen through', async () => {
    await mountEditor('engineer')
    const ids = [...container.querySelectorAll('[data-blob]')].map((e) => e.getAttribute('data-blob'))
    expect(ids).toEqual(files.moved.blobs.map((b) => b.id))
    expect(row('b001').textContent).toContain('0.32 m² · seen through 41 times')
    expect(text()).toContain('Remove all 6')
  })

  it('stages Remove and Keep, and saves them as one cloud edit followed to the end', async () => {
    const onSaved = vi.fn()
    await mountEditor('engineer', { onSaved })
    expect(button('Save version')!.disabled).toBe(true)
    await click(rowButton('b001', 'Remove'))
    await click(rowButton('b002', 'Keep'))
    expect(row('b001').textContent).toContain('Will be removed')
    expect(container.querySelector('[data-testid="pending"]')!.textContent).toBe('1 spot to remove · 1 spot to keep')
    await click(button('Save version'))
    await until(() => text().includes('Saved as a new version'))
    expect(fake.postCloudEdits).toHaveBeenCalledTimes(1)
    expect(fake.postCloudEdits.mock.calls[0][2]).toMatchObject({ resolve_moved: ['b001'], keep_moved: ['b002'], delete_boxes: [] })
    expect(fake.putMapPlanning).not.toHaveBeenCalled()
    expect(text()).toContain('120 points deleted.')
    expect(text()).toContain("2 cells couldn't be freed from the cloud alone. Brush the rest.")
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }))
  })

  it('shows a failed job in its own words and keeps what was staged', async () => {
    fake.getMapJob.mockResolvedValue(job({ status: 'failed', error: 'the map changed while this edit was being made; reload it and save again' }))
    await mountEditor('engineer')
    await click(button('Remove all 6'))
    await click(button('Save version'))
    await until(() => text().includes('Failed:'))
    expect(text()).toContain('Failed: the map changed while this edit was being made; reload it and save again')
    expect(row('b003').textContent).toContain('Will be removed')
  })
})

describe('the brush', () => {
  const tool = (label: string) => [...container.querySelectorAll('[role="toolbar"] button')].find((b) => b.textContent === label) as HTMLButtonElement

  it('is off on a floor with no planning grid, which still takes cloud edits and sends no grid', async () => {
    await mountEditor('engineer')
    expect(text()).toContain('This floor has no planning grid yet. Build one with tools/map_prep/planning_grid.py and upload it; then the brush works.')
    expect(tool('Erase').disabled).toBe(true)
    expect(tool('Restore').disabled).toBe(true)
    // Never started from the survey grid: a slice above the furniture would make desks walkable.
    expect(button('Start from the survey grid')).toBeUndefined()
    await click(rowButton('b001', 'Remove'))
    await click(button('Save version'))
    await until(() => text().includes('Saved as a new version'))
    expect(fake.postCloudEdits).toHaveBeenCalledTimes(1)
    expect(fake.putMapPlanning).not.toHaveBeenCalled()
  })

  it('paints the stored planning grid, and Save sends it with only the painted cells changed', async () => {
    const planning = Uint8Array.from(files.grid)
    fake.getMapFloorFile.mockImplementation(async (_m: string, _f: number, kind: string) =>
      kind === 'grid' || kind === 'planning' ? encodePgm(60, 50, planning).slice().buffer : null)
    // jsdom lays nothing out: give the canvas a size, and frames as timeouts.
    const box = { left: 0, top: 0, width: 600, height: 500, right: 600, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 })
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box as DOMRect)
    try {
      await mountEditor('engineer')
      expect(text()).not.toContain('no planning grid')
      await click(tool('Restore'))
      const canvas = container.querySelector('[data-testid="floor-edit-canvas"]')!
      const fire = (type: string, x: number) => act(async () => {
        canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 250, button: 0 }))
      })
      await fire('pointerdown', 290)
      await fire('pointermove', 310)
      await fire('pointerup', 310)
      await tick(20)
      expect(container.querySelector('[data-testid="pending"]')!.textContent).toMatch(/^\d+ cells painted$/)
      await click(button('Save version'))
      await until(() => fake.putMapPlanning.mock.calls.length > 0 && !text().includes('Saving…'))
      const sent = parsePgm(fake.putMapPlanning.mock.calls[0][2] as Uint8Array)!
      expect([sent.width, sent.height]).toEqual([60, 50])
      const changed = [...sent.pixels].flatMap((v, k) => (v === planning[k] ? [] : [k]))
      expect(changed.length).toBeGreaterThan(0)
      // Restore only blocks cells that were walkable.
      for (const k of changed) { expect(planning[k]).toBe(254); expect(sent.pixels[k]).toBe(0) }
      expect(fake.postCloudEdits).not.toHaveBeenCalled()
    } finally {
      rect.mockRestore()
      // Back to Element.prototype's own (jsdom's 0).
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
    }
  })
})

describe('leaving', () => {
  it('asks in the page before dropping unsaved changes', async () => {
    const onClose = vi.fn()
    await mountEditor('engineer', { onClose })
    await click(rowButton('b001', 'Remove'))
    await click(button('Close editor'))
    expect(onClose).not.toHaveBeenCalled()
    expect(text()).toContain('Leave the editor and lose 1 unsaved change?')
    await click(button('Keep editing'))
    expect(text()).not.toContain('Leave the editor')
    await click(button('Close editor'))
    await click(button('Leave without saving'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes at once with nothing unsaved', async () => {
    const onClose = vi.fn()
    await mountEditor('engineer', { onClose })
    await click(button('Close editor'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Find moving things again', () => {
  it('reloads the moved list, and takes the new map version, once the robot has searched again', async () => {
    fake.listMapJobs.mockResolvedValue([job({
      job_id: 'mjob-s', kind: 'survey', status: 'succeeded', stage: 'done', finished_at: '2026-11-16T01:00:00Z',
      detail: { floor: floor.index, survey_id: 'sv-1', robot_id: 'rover-jetson' },
    })])
    fake.getRobots.mockReturnValue([{ robot_id: 'rover-jetson', name: 'Jetson', connectivity: { bridge_state: 'connected' }, bridge: { schema_version: '0.0.23' } }])
    findMovingCommand.mockResolvedValue({ result: 'completed', command: { result: { moved_spots: 2 } } })
    const onSaved = vi.fn()
    await mountEditor('engineer', { onSaved })
    await until(() => !button('Find moving things again')!.disabled)
    const reads = fake.getMovedLayer.mock.calls.length
    fake.getMovedLayer.mockResolvedValue({ ...files.moved, blobs: files.moved.blobs.slice(0, 2) })
    await click(button('Find moving things again'))
    await until(() => text().includes('Found 2 spots'))
    await until(() => !text().includes('Spot 3'))
    expect(findMovingCommand).toHaveBeenCalledWith('rover-jetson', { survey_id: 'sv-1', map_id: map.map_id, floor_index: floor.index, sensitivity: 0.5 })
    expect(fake.getMovedLayer.mock.calls.length).toBeGreaterThan(reads)
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ updated_at: '2026-11-16T08:00:00Z' }))
  })
})

describe('Show things that moved (0.0.29)', () => {
  const toggle = () => [...container.querySelectorAll('[role="toolbar"] button')].find((b) => b.textContent === 'Moved') as HTMLButtonElement
  const canvas = () => container.querySelector<HTMLCanvasElement>('[data-testid="floor-edit-canvas"]')!
  beforeEach(() => { try { window.localStorage.removeItem(SHOW_MOVED_KEY) } catch { /* none */ } })

  it('sits in the tool rail, on by default', async () => {
    await mountEditor('engineer')
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(canvas().dataset.moved).toBe('shown')
  })

  it('moved toggle off hides amber points without touching the edit session', async () => {
    await mountEditor('engineer')
    await click(rowButton('b001', 'Remove'))
    const pending = container.querySelector('[data-testid="pending"]')!.textContent
    await click(toggle())
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    expect(canvas().dataset.moved).toBe('hidden')
    // The list, what is staged, and Save are as they were.
    expect(container.querySelector('[data-testid="pending"]')!.textContent).toBe(pending)
    expect(row('b001').textContent).toContain('Will be removed')
    expect(button('Save version')!.disabled).toBe(false)
    expect(fake.postCloudEdits).not.toHaveBeenCalled()
    await click(toggle())
    expect(canvas().dataset.moved).toBe('shown')
  })

  it('is remembered for this viewer, and storage that throws reads as on', async () => {
    await mountEditor('engineer')
    await click(toggle())
    expect(window.localStorage.getItem(SHOW_MOVED_KEY)).toBe('off')
    act(() => root.unmount())
    root = createRoot(container)
    await mountEditor('engineer')
    expect(canvas().dataset.moved).toBe('hidden')
    act(() => root.unmount())
    root = createRoot(container)
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      await mountEditor('engineer')
      expect(canvas().dataset.moved).toBe('shown')
    } finally {
      get.mockRestore()
    }
  })
})

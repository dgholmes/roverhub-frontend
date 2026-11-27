// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The run page, layout A, on the mock provider: the sample runs are a coarse
 * history run, a full run log with video, and a run with neither. Leaflet is
 * stood in (jsdom has no layout); each layer records its renders so the test
 * can pin that moving the cursor redraws the cursor's layers and nothing else.
 */
const renders = vi.hoisted(() => ({ lines: [] as { dash?: string; color?: string }[] }))
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} }, divIcon: () => ({}) } }))
vi.mock('react-leaflet', () => ({
  MapContainer: (p: { children?: React.ReactNode }) => <div data-map>{p.children}</div>,
  Polyline: (p: { pathOptions?: { dashArray?: string; color?: string } }) => {
    renders.lines.push({ dash: p.pathOptions?.dashArray, color: p.pathOptions?.color })
    return <i data-layer="line" data-dash={p.pathOptions?.dashArray ?? ''} />
  },
  Circle: () => <i data-layer="ring" />,
  CircleMarker: () => <i data-layer="robot" />,
  Marker: () => <i data-layer="number" />,
  useMap: () => ({ invalidateSize: () => {}, fitBounds: () => {}, on: () => {}, off: () => {}, getContainer: () => document.createElement('div') }),
}))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({ FloorplanLayer: () => <i data-layer="floorplan" /> }))
vi.mock('@/components/liveops/map/GridLayer', () => ({ GridLayer: () => <i data-layer="grid" /> }))
vi.mock('@/missions/useMissionMap', () => ({ useMissionMap: () => ({ resolved: { status: 'none' }, retry: () => {} }) }))
const shell = vi.hoisted(() => ({ narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({ useTouchShell: () => ({ touch: false, narrow: shell.narrow, orientation: 'landscape', big: false }) }))
vi.mock('@/lib/realtime/dataProvider', async () => ({
  dataProvider: (await import('@/mocks/mockDataProvider')).mockDataProvider,
  USE_REAL_BACKEND: false, API_BASE_URL: '', MQTT_WS_URL: '', SITE_FILTER: '',
}))

import { mockDataProvider } from '@/mocks/mockDataProvider'
import { RunPage } from './RunPage'

class RO { observe() {} disconnect() {} }
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO

let host: HTMLDivElement
let root: Root
let ids: string[]
beforeEach(async () => {
  await i18n.changeLanguage('en')
  shell.narrow = false
  renders.lines = []
  // Newest first: history (2 h ago), trace with video (26 h), none (50 h).
  ids = (await mockDataProvider.listRuns({})).items.map((r) => r.run_id)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

async function open(runId: string) {
  await act(async () => { root.render(<RunPage siteId="site-north-yard" runId={runId} onBack={() => {}} />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const text = () => host.textContent ?? ''

describe('RunPage, layout A', () => {
  it('a run log: figure with route, plans and walk; camera in the corner; three lanes; legs', async () => {
    await open(ids[1])
    expect(host.querySelector('[data-run-figure] [data-map]')).not.toBeNull()
    expect(host.querySelector('[data-run-pip]')).not.toBeNull()
    expect(text()).toContain('Front camera')
    expect(text()).toContain('Perimeter Patrol — North Yard')
    expect(text()).toContain('drawn vs planned vs walked')
    expect(host.querySelectorAll('[data-layer="number"]')).toHaveLength(4)
    expect(host.querySelectorAll('[data-layer="line"][data-dash="6 6"]')).toHaveLength(1)
    for (const lane of ['Events', 'Controller', 'Speed']) expect(text()).toContain(lane)
    expect(text()).toContain('FollowPathTight')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(text()).not.toContain('Coarse')
  })

  it('moving the cursor redraws the cursor layers, not the route, and highlights the leg under it', async () => {
    await open(ids[1])
    const slider = host.querySelector('[role="slider"]') as HTMLElement
    const routeBefore = renders.lines.filter((l) => l.dash === '6 6').length
    const linesBefore = renders.lines.length
    // Into the second leg (it starts 80 s in).
    await act(async () => { for (let i = 0; i < 12; i++) slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })) })
    expect(slider.getAttribute('aria-valuenow')).toBe('120')
    expect(renders.lines.length).toBeGreaterThan(linesBefore)
    expect(renders.lines.filter((l) => l.dash === '6 6').length).toBe(routeBefore)
    const rows = [...host.querySelectorAll('tbody tr')]
    expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false'])
  })

  it('a history run: the coarse note, the walk, no legs table and no Controller lane', async () => {
    await open(ids[0])
    expect(text()).toContain('Coarse: recorded every 5 s, before run logs.')
    expect(host.querySelector('tbody')).toBeNull()
    expect(text()).not.toContain('Controller')
    expect(host.querySelector('[data-layer="robot"]')).not.toBeNull()
  })

  it('no run log: says so, and the page still renders', async () => {
    await open(ids[2])
    expect(text()).toContain('No run log for this run')
    expect(host.querySelector('[data-run-figure]')).not.toBeNull()
  })

  it('no video: no camera in the corner', async () => {
    const real = await mockDataProvider.getRun(ids[1])
    vi.spyOn(mockDataProvider, 'getRun').mockResolvedValue({ ...real, files: real.files.filter((f) => !f.path.startsWith('video/')) })
    const track = await mockDataProvider.runTrack(ids[1])
    vi.spyOn(mockDataProvider, 'runTrack').mockResolvedValue({ ...track!, video: {} })
    await open(ids[1])
    expect(host.querySelector('[data-run-pip]')).toBeNull()
    expect(text()).not.toContain('Front camera')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(4)
  })

  it('a failed run-log read leaves the page as it was', async () => {
    vi.spyOn(mockDataProvider, 'runTrack').mockRejectedValue(new Error('500'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await open(ids[1])
    expect(text()).toContain('Perimeter Patrol — North Yard')
    expect(host.querySelector('[data-run-pip]')).not.toBeNull()
  })

  it('narrow: the camera stacks under the figure instead of in its corner', async () => {
    shell.narrow = true
    await open(ids[1])
    expect(host.querySelector('[data-run-pip]')).toBeNull()
    expect(host.querySelector('[data-run-video]')).not.toBeNull()
  })
})

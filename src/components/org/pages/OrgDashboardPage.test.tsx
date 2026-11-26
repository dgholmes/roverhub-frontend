// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { RobotState } from '@/types'
import { initialRobots } from '@/mocks/mockRobots'

const { provider } = vi.hoisted(() => ({ provider: { mapArtifactUrl: vi.fn(() => ''), listMaps: vi.fn(async () => []) } }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: create(() => ({ robots: [] as RobotState[], missions: {} })),
}))

import { OrgDashboardPage } from './OrgDashboardPage'
import { useSessionStore } from '@/store/useSessionStore'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSiteMapsStore } from '@/org/useSiteMaps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Rendered on the client: a server render reads a zustand store's initial
 * state, not what the test set. */
function renderHtml(el: React.ReactElement): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(el))
  const html = host.innerHTML
  act(() => root.unmount())
  return html
}

const entry = (maps: typeof mockMaps | null, error: string | null = null) => ({ maps, loading: false, error, at: Date.now() })
const thumbOf = (html: string, siteId: string) =>
  new RegExp(`data-dashboard-site="${siteId}"[^]*?data-thumbnail="([a-z]+)"`).exec(html)?.[1]

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  useSessionStore.setState({
    sites: [
      { id: 'site-north-yard', name: 'North Yard', timezone: 'Asia/Seoul' },
      { id: 'site-plant-3', name: 'Plant 3', timezone: 'Asia/Seoul' },
      { id: 'site-new', name: 'New site', timezone: 'UTC' },
      { id: 'site-down', name: 'Down', timezone: 'UTC' },
    ],
  })
  useSiteMapsStore.setState({
    bySite: {
      'site-north-yard': entry(mockMaps.filter((m) => m.site_id === 'site-north-yard')),
      'site-plant-3': entry([]),
      'site-down': entry(null, 'GET /maps answered 500'),
      // site-new: not asked yet, so still loading
    },
  })
})

describe('Dashboard › Sites', () => {
  it('shows each site by its floor map, with a fallback for every way there can be none', () => {
    const html = renderHtml(<OrgDashboardPage />)
    expect(thumbOf(html, 'site-north-yard')).toBe('sketch')
    expect(thumbOf(html, 'site-plant-3')).toBe('none')
    expect(thumbOf(html, 'site-new')).toBe('loading')
    expect(thumbOf(html, 'site-down')).toBe('error')
    expect(html).toContain('No map yet')
    expect(html).toContain('Enter site')
  })

  it('leaves the lat/lng map out until a site has a location', () => {
    expect(renderHtml(<OrgDashboardPage />)).not.toMatch(/aria-label="Map of \d+ sites"/)
    useSessionStore.setState((s) => ({ sites: [{ ...s.sites[0], location: { lat: 37.4, lng: 126.7 } }, ...s.sites.slice(1)] }))
    const html = renderHtml(<OrgDashboardPage />)
    expect(html).toContain('aria-label="Map of 1 sites"')
    expect(html).toContain('3 sites have no location')
  })
})

describe('Dashboard › Needs attention', () => {
  const north = (id: string, patch: Partial<RobotState> = {}): RobotState =>
    ({ ...initialRobots.find((r) => r.robot_id === id)!, ...patch })
  const click = (label: string) => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<OrgDashboardPage />))
    const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label)
    expect(button).toBeDefined()
    act(() => button!.click())
    act(() => root.unmount())
  }
  const show = (robots: RobotState[]) => (useLiveOpsStore as unknown as { setState: (s: object) => void }).setState({ robots })

  it("opens a hot motor on the robot's Motors tab", () => {
    show([north('zaezae-x1-001')])
    click('Motors')
    expect(window.location.hash).toBe('#/site/site-north-yard/fleet/zaezae-x1-001/motors')
  })

  it('opens an unreachable robot on its Edge device tab', () => {
    const r = north('zaezae-x1-002')
    show([{ ...r, connectivity: { ...r.connectivity, grpc: 'unavailable' } }])
    click('Edge device')
    expect(window.location.hash).toBe('#/site/site-north-yard/fleet/zaezae-x1-002/edge')
  })

  it('opens a low battery on Overview, and a fallen robot in LiveOps', () => {
    show([north('zaezae-x1-002', { battery: { percent: 10, est_runtime_min: 0, charging: false } })])
    click('Open')
    expect(window.location.hash).toBe('#/site/site-north-yard/fleet/zaezae-x1-002')
    show([north('zaezae-x1-002', { posture: 'fallen' })])
    click('Open in LiveOps')
    expect(window.location.hash).toBe('#/site/site-north-yard/liveops')
  })
})

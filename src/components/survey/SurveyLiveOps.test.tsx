// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { mockMaps } from '@/mocks/maps'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import type { SurveyStatus } from '@/types/survey'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The survey's status is what these pin, so it is set directly; the live map
// has its own tests and is stood in.
const { survey } = vi.hoisted(() => ({ survey: { status: null as SurveyStatus | null } }))
vi.mock('@/survey/useSurvey', () => ({
  useSurveyStatus: () => survey.status,
  useSurveyStatuses: () => ({}),
  useSurveyMap: () => null,
  useDecodedSurveyMap: () => ({ map: null, error: null }),
}))
vi.mock('./SurveyLiveMap', () => ({ SurveyLiveMap: (p: { compact?: boolean }) => <i data-live-map={p.compact ? 'compact' : 'full'} /> }))

// The map canvas around the pane, stood in as MapCanvas.test.tsx does.
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({ MapContainer: (p: { children?: React.ReactNode }) => <div data-leaflet>{p.children}</div>, Polygon: () => null, Tooltip: () => null }))
vi.mock('@/components/liveops/map/GridLayer', () => ({ GridLayer: () => null }))
vi.mock('@/components/liveops/map/AnnotationLayer', () => ({ AnnotationLayer: () => null }))
vi.mock('@/components/liveops/map/DockMarker', () => ({ DockMarker: () => null }))
vi.mock('@/components/liveops/map/RouteLayer', () => ({ RouteLayer: () => null }))
vi.mock('@/components/liveops/map/WalkableLayer', () => ({ WalkableLayer: () => null }))
vi.mock('@/components/liveops/map/ScanLayer', () => ({ ScanLayer: () => null }))
vi.mock('@/components/liveops/map/LiveScene', () => ({ LiveScene: () => null }))
vi.mock('@/components/liveops/map/FloorPicker', () => ({ FloorPicker: () => null }))
vi.mock('@/components/liveops/map/RobotMarker', () => ({ RobotMarker: () => null }))
vi.mock('@/components/liveops/map/MapControls', () => ({ MapControls: () => null }))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({ FloorplanLayer: () => null }))
vi.mock('@/components/liveops/map/RobotBodyLayer', () => ({ RobotBodyLayer: () => null }))
vi.mock('@/components/liveops/map/FitToSite', () => ({ FitToSite: () => null }))
vi.mock('@/scene3d/useSceneData', () => ({ useSceneData: () => ({ status: 'unavailable', data: null }) }))
vi.mock('@/components/liveops/map/NavGoalLayer', () => ({
  useNavGoal: () => ({ markers: {}, input: {}, tools: {}, bar: {} }),
  NavGoalMarkers: () => null,
  NavMapInput: () => null,
  NavTools: () => <i data-nav="tools" />,
  NavBar: () => <i data-nav="bar" />,
}))

import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { SurveyBanner, useSurveyMenu } from './SurveyLiveOps'

const robot = (over: Partial<RobotState> = {}): RobotState =>
  ({ ...initialRobots[0], robot_id: 'rover-jetson', name: 'rover-jetson', abstract_state: 'STAND', control_owner: null, ...over })
const oldBridge = (r: RobotState): RobotState => ({ ...r, bridge: { ...r.bridge!, schema_version: '0.0.22' } })

const status = (state: SurveyStatus['state'], over: Partial<SurveyStatus> = {}): SurveyStatus => ({
  robot_id: 'rover-jetson', site_id: 'site-north-yard', state, survey_id: 's1', name: 'Office', elapsed_s: 372,
  covered_m2: 142.4, path_length_m: 88, drift: 'good', cameras: 'off', updated_at: 'x', ...over,
})

let host: HTMLDivElement
let root: Root
const text = () => host.textContent ?? ''
const render = (node: React.ReactNode) => act(() => root.render(node))

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  survey.status = null
  useSessionStore.setState({ role: 'engineer' })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('LiveOps map pane in survey mode', () => {
  const pane = (r: RobotState, variant: 'full' | 'mini' = 'full') =>
    renderToStaticMarkup(<MapCanvas robot={r} map={mockMaps[0]} variant={variant} />)

  it('shows the site map, with tap-to-walk, when no survey runs', () => {
    const html = pane(robot())
    expect(html).toContain('data-leaflet')
    expect(html).toContain('data-nav="tools"')
    expect(html).not.toContain('data-survey-pane')
  })

  it('shows the live survey map instead while the survey has the lidar, and says why the nav tools are gone', () => {
    for (const state of ['starting', 'recording', 'saving'] as const) {
      survey.status = status(state)
      const html = pane(robot())
      expect(html).toContain('data-survey-pane')
      expect(html).toContain('data-live-map="full"')
      expect(html).not.toContain('data-leaflet')
      expect(html).not.toContain('data-nav=')
      expect(html).toContain('Go to point and Set position are off while surveying')
    }
    survey.status = status('recording')
    expect(pane(robot(), 'mini')).toContain('data-live-map="compact"')
  })

  it('goes back to the site map once the survey hands the lidar back', () => {
    survey.status = status('processing')
    expect(pane(robot())).toContain('data-leaflet')
  })

  it('never swaps for a bridge older than 0.0.23', () => {
    survey.status = status('recording')
    expect(pane(oldBridge(robot()))).not.toContain('data-survey-pane')
  })
})

describe('SurveyBanner', () => {
  it('shows time, coverage and Stop & save while surveying', () => {
    survey.status = status('recording')
    render(<SurveyBanner robot={robot()} />)
    expect(text()).toMatch('Surveying · 6:12 · 142 m² covered')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Stop & save')).toBe(true)
    expect(host.querySelector('a')?.getAttribute('href')).toBe('#/site/site-north-yard/missions/maps/survey/rover-jetson')
  })

  it('leaves Stop & save to the Engineer role', () => {
    useSessionStore.setState({ role: 'operator' })
    survey.status = status('recording')
    render(<SurveyBanner robot={robot()} />)
    expect(text()).toMatch('Surveying')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Stop & save')).toBe(false)
  })

  it('does not announce a retained result from before the page opened', () => {
    survey.status = status('done', { map_id: 'map-x' })
    render(<SurveyBanner robot={robot()} />)
    expect(host.querySelector('[data-survey-banner]')).toBeNull()
  })

  it('follows a survey it saw running to its draft map, until dismissed', () => {
    survey.status = status('recording')
    render(<SurveyBanner robot={robot()} />)
    survey.status = status('uploading', { stage: 'Uploading the draft map', progress: 0.5 })
    render(<SurveyBanner robot={robot()} />)
    expect(text()).toMatch('Saving the survey: Uploading the draft map')
    expect(text()).toMatch('50%')
    survey.status = status('done', { map_id: 'map-x' })
    render(<SurveyBanner robot={robot()} />)
    expect(text()).toMatch('Survey saved as a draft map')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('#/site/site-north-yard/missions/maps/edit/map-x')
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click())
    expect(host.querySelector('[data-survey-banner]')).toBeNull()
  })

  it('shows nothing for an older bridge', () => {
    survey.status = status('recording')
    render(<SurveyBanner robot={oldBridge(robot())} />)
    expect(host.querySelector('[data-survey-banner]')).toBeNull()
  })
})

describe('useSurveyMenu', () => {
  let entry: ReturnType<typeof useSurveyMenu>['entry'] = null
  function Probe({ r }: { r: RobotState }) {
    entry = useSurveyMenu(r, null).entry
    return null
  }

  it('offers Start survey to an engineer on a 0.0.23 bridge', () => {
    render(<Probe r={robot()} />)
    expect(entry).toMatchObject({ label: 'Start survey', availability: { enabled: true } })
  })

  it('offers nothing for an older bridge', () => {
    render(<Probe r={oldBridge(robot())} />)
    expect(entry).toBeNull()
  })

  it('says why it cannot start now', () => {
    render(<Probe r={robot({ abstract_state: 'E_STOP' })} />)
    expect(entry).toMatchObject({ availability: { enabled: false, reason: 'Release the E-Stop first.' } })
  })

  it('offers Open survey to anyone while one is under way, and no start without configure', () => {
    useSessionStore.setState({ role: 'operator' })
    render(<Probe r={robot()} />)
    expect(entry).toBeNull()
    survey.status = status('recording')
    render(<Probe r={robot({ abstract_state: 'MANUAL' })} />)
    expect(entry).toMatchObject({ label: 'Open survey', availability: { enabled: true } })
  })
})

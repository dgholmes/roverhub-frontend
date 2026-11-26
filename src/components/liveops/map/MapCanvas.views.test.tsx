// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { SceneData } from '@/scene3d/types'
import type { SceneDataState } from '@/scene3d/useSceneData'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import type { LiveSceneProps } from './LiveScene'
import { MAP_VIEW_KEY } from './MapViewSwitch'
import { resetRobotMarkerStyleForTests, setRobotMarkerStyle } from '@/liveops/robotMarkerPref'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The flat map and its layers stood in: what this pins is which view MapCanvas
// shows, with what, and that the nav tools and bar sit over every one of them.
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({
  MapContainer: (p: { children?: React.ReactNode }) => <div data-testid="leaflet">{p.children}</div>,
}))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => [] }))
vi.mock('@/store/useSessionStore', () => ({ useSessionStore: () => () => {} }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { sampleSite: () => ({ zones: [], annotations: [] }) } }))
vi.mock('@/liveops/useWalkableArea', () => ({ useWalkableArea: () => ({ state: 'none' }) }))
for (const layer of [
  'GridLayer', 'RouteLayer', 'DockMarker', 'AnnotationLayer', 'RobotMarker', 'MapControls', 'FloorplanLayer',
  'GeofenceLayer', 'NoGoZoneLayer', 'WalkableLayer', 'ScanLayer',
  'UnsurveyedLayer', 'OutlierLayer', 'ClassicRobotMarker',
]) {
  vi.doMock(`./${layer}`, () => ({ [layer]: () => null }))
}
// FollowRobot stood in by a probe: what it was told, and its pause callback.
const followProbe = vi.hoisted(() => ({ props: null as null | { following: boolean; epoch: number; spanM: number; interactive: boolean; onUserMove?: () => void } }))
vi.doMock('./FollowRobot', () => ({
  FollowRobot: (p: NonNullable<typeof followProbe.props>) => { followProbe.props = p; return null },
}))
vi.mock('./FloorPicker', () => ({ FloorPicker: () => <i data-testid="floors" /> }))
// The two markers stood in by what they are, so a test can tell which one drew.
vi.doMock('./RobotMarker', () => ({ RobotMarker: (p: { selected: boolean }) => <i data-marker="body" data-selected={p.selected} /> }))
// MapControls stood in by a button that opens its layers menu.
vi.doMock('./MapControls', () => ({
  MapControls: (p: { onMenuOpenChange?: (o: boolean) => void }) => (
    <button data-testid="open-layers" onClick={() => p.onMenuOpenChange?.(true)} />
  ),
}))
vi.doMock('./ClassicRobotMarker', () => ({ ClassicRobotMarker: (p: { selected: boolean }) => <i data-marker="classic" data-selected={p.selected} /> }))

const nav = vi.hoisted(() => ({
  value: {
    markers: { from: null, pending: null, pendingRefused: false, walking: null, pose: null },
    input: { mode: 'go', onTap: () => {}, onPress: () => {}, onDrag: () => {}, onRelease: () => {}, onEscape: () => {} },
    tools: {},
    bar: {},
  },
}))
vi.mock('./NavGoalLayer', () => ({
  useNavGoal: () => nav.value,
  NavGoalMarkers: () => <i data-nav="markers" />,
  NavMapInput: () => <i data-nav="input" />,
  NavTools: () => <i data-nav="tools" />,
  NavBar: () => <i data-nav="bar" />,
}))

const sceneState = vi.hoisted(() => ({ value: { status: 'unavailable', data: null } as SceneDataState, calls: [] as unknown[] }))
vi.mock('@/scene3d/useSceneData', () => ({
  useSceneData: (map: unknown) => { sceneState.calls.push(map); return sceneState.value },
}))
const live = vi.hoisted(() => ({ props: null as LiveSceneProps | null }))
vi.mock('./LiveScene', () => ({
  LiveScene: (p: LiveSceneProps) => { live.props = p; return <div data-testid="scene" /> },
}))

const { MapCanvas } = await import('./MapCanvas')

// The pane's size and the tools preference, controlled: jsdom measures every
// element as 0 x 0, which would always be a small map.
const tools = vi.hoisted(() => ({ compact: false, open: true }))
vi.mock('./MapTools', async (orig) => ({
  ...(await orig<typeof import('./MapTools')>()),
  useCompact: () => tools.compact,
  useMapToolsPref: () => [tools.open, (o: boolean) => { tools.open = o }],
}))

const robot = { robot_id: 'r1' } as RobotState
const map: SiteMap = { ...mockMaps[0], zones: [] }
const withCloud = { mapId: map.map_id, cloud: { count: 5 } } as unknown as SceneData
const noCloud = { mapId: map.map_id, cloud: null } as unknown as SceneData

let host: HTMLDivElement
let root: Root
const draw = (variant: 'full' | 'mini' = 'full', m: SiteMap | undefined = map) =>
  act(() => root.render(<MapCanvas robot={robot} map={m} variant={variant} />))
const q = (sel: string) => host.querySelector(sel)
const viewButton = (view: string) => q(`button[data-view="${view}"]`) as HTMLButtonElement | null

beforeEach(() => {
  tools.compact = false
  tools.open = true
  localStorage.clear()
  resetRobotMarkerStyleForTests()
  void i18n.changeLanguage('en')
  sceneState.value = { status: 'unavailable', data: null, reason: 'none' }
  sceneState.calls = []
  live.props = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('MapCanvas views', () => {
  it('Plan is the Leaflet map, with its tap input, and the tools and bar over it', () => {
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    expect(q('[data-testid="leaflet"]')).not.toBeNull()
    expect(q('[data-nav="input"]')).not.toBeNull()
    expect(q('[data-testid="scene"]')).toBeNull()
    expect(q('[data-nav="tools"]')).not.toBeNull()
    expect(q('[data-nav="bar"]')).not.toBeNull()
    expect(viewButton('plan')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('without scene data the scene views are disabled and the map stays on Plan, whatever was chosen', () => {
    localStorage.setItem(MAP_VIEW_KEY, 'fly')
    draw()
    expect(viewButton('3d')!.disabled).toBe(true)
    expect(viewButton('fly')!.disabled).toBe(true)
    expect(viewButton('follow')!.disabled).toBe(true)
    expect(q('[data-testid="leaflet"]')).not.toBeNull()
    expect(q('[data-testid="scene"]')).toBeNull()
  })

  it('while the scene loads it stays on Plan, then shows the remembered view', () => {
    localStorage.setItem(MAP_VIEW_KEY, 'fly')
    sceneState.value = { status: 'loading', data: null }
    draw()
    expect(viewButton('fly')!.title).toBe('Loading the 3D map…')
    expect(q('[data-testid="leaflet"]')).not.toBeNull()
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    expect(q('[data-testid="leaflet"]')).toBeNull()
    expect(live.props!.view).toBe('fly')
  })

  it('a floor with no cloud offers 3D but not Fly or Follow', () => {
    sceneState.value = { status: 'ready', data: noCloud }
    localStorage.setItem(MAP_VIEW_KEY, 'follow')
    draw()
    expect(viewButton('3d')!.disabled).toBe(false)
    expect(viewButton('fly')!.disabled).toBe(true)
    expect(q('[data-testid="leaflet"]')).not.toBeNull()
  })

  it('choosing 3D swaps the Leaflet map for the scene, keeps the tools and bar, and is remembered', () => {
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    act(() => viewButton('3d')!.click())
    expect(q('[data-testid="leaflet"]')).toBeNull()
    expect(q('[data-nav="input"]')).toBeNull()
    expect(q('[data-testid="scene"]')).not.toBeNull()
    expect(q('[data-nav="tools"]')).not.toBeNull()
    expect(q('[data-nav="bar"]')).not.toBeNull()
    expect(localStorage.getItem(MAP_VIEW_KEY)).toBe('3d')
    expect(viewButton('3d')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('opens on the remembered view, and hands the scene the nav state and the floor', () => {
    localStorage.setItem(MAP_VIEW_KEY, 'follow')
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    const p = live.props!
    expect(p.view).toBe('follow')
    expect(p.data).toBe(withCloud)
    expect(p.mapId).toBe(map.map_id)
    expect(p.input).toBe(nav.value.input)
    expect(p.markers).toBe(nav.value.markers)
    expect(p.layers).toMatchObject({ geofence: true, noGoZones: true })
  })

  it('the scene asking for the flat map goes back to Plan', () => {
    localStorage.setItem(MAP_VIEW_KEY, '3d')
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    act(() => live.props!.onViewChange('plan'))
    expect(q('[data-testid="leaflet"]')).not.toBeNull()
    expect(localStorage.getItem(MAP_VIEW_KEY)).toBe('plan')
  })

  it('the mini inset has no switch and no scene, and loads none', () => {
    localStorage.setItem(MAP_VIEW_KEY, '3d')
    sceneState.value = { status: 'ready', data: withCloud }
    draw('mini')
    expect(q('button[data-view]')).toBeNull()
    expect(q('[data-testid="scene"]')).toBeNull()
    expect(q('[data-testid="leaflet"]')).not.toBeNull()
    expect(sceneState.calls.every((m) => m === undefined)).toBe(true)
  })

  it('a canvas with no survey has no switch', () => {
    act(() => root.render(<MapCanvas robot={robot} variant="full" />))
    expect(q('button[data-view]')).toBeNull()
  })

  it('puts the tools and bar inside the scene while it is fullscreen, marked as scene UI', () => {
    localStorage.setItem(MAP_VIEW_KEY, 'fly')
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    const sceneEl = q('[data-testid="scene"]')!
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => sceneEl })
    try {
      act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
      const inside = sceneEl.querySelector('[data-scene-ui]')
      expect(inside?.querySelector('[data-nav="tools"]')).not.toBeNull()
      expect(inside?.querySelector('[data-nav="bar"]')).not.toBeNull()
      expect(host.querySelectorAll('[data-nav="bar"]')).toHaveLength(1)
    } finally {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
      act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    }
    expect(sceneEl.querySelector('[data-scene-ui]')).toBeNull()
    expect(q('[data-nav="bar"]')).not.toBeNull()
  })
})

describe('MapCanvas tools', () => {
  it('a small map is only the map: no tools, no switch, no toggle', () => {
    tools.compact = true
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    expect(viewButton('3d')).toBeNull()
    expect(q('button[aria-pressed][title="Map tools"]')).toBeNull()
  })

  it('a large map starts with only the tools button, and opening it shows the switch', () => {
    tools.open = false
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    expect(viewButton('3d')).toBeNull()
    const toggle = q('button[title="Map tools"]') as HTMLButtonElement
    expect(toggle).not.toBeNull()
    act(() => toggle.click())
    expect(tools.open).toBe(true)
  })
})

describe('MapCanvas robot marker', () => {
  it('draws the body marker by default', () => {
    draw()
    expect(q('[data-marker="body"][data-selected="true"]')).not.toBeNull()
    expect(q('[data-marker="classic"]')).toBeNull()
  })

  it('draws the classic marker once it is chosen, and switches without a reload', () => {
    draw()
    act(() => setRobotMarkerStyle('classic'))
    expect(q('[data-marker="classic"][data-selected="true"]')).not.toBeNull()
    expect(q('[data-marker="body"]')).toBeNull()
  })

  it('draws the same marker in the mini inset', () => {
    setRobotMarkerStyle('classic')
    draw('mini')
    expect(q('[data-marker="classic"]')).not.toBeNull()
  })
})

describe('MapCanvas view switch and the layers menu', () => {
  // The switch paints over the menu whatever its z-index, and the menu is now
  // tall enough to reach it, so the switch steps aside while it is open.
  it('hides the view switch while the layers menu is open', () => {
    sceneState.value = { status: 'ready', data: withCloud }
    draw()
    expect(viewButton('plan')).not.toBeNull()
    act(() => (q('[data-testid="open-layers"]') as HTMLButtonElement).click())
    expect(viewButton('plan')).toBeNull()
  })
})

// Every LiveOps map mounts MapCanvas, so this is where "all of them follow" is
// pinned. Was, until 2026-11-25: the full map followed only while a mission
// run walked, and nothing zoomed in on the robot.
describe('MapCanvas follows the robot', () => {
  const followButton = () => q('[data-follow-robot]') as HTMLButtonElement | null

  it('the full map follows from the start, zoomed in close, with no run and no button', () => {
    draw()
    expect(followProbe.props).toMatchObject({ following: true, spanM: 8, interactive: true })
    expect(followButton()).toBeNull()
  })

  it('so does a full map with no survey', () => {
    draw('full', undefined)
    expect(followProbe.props).toMatchObject({ following: true, spanM: 8 })
  })

  it('the inset follows at its own span and cannot be paused', () => {
    draw('mini')
    expect(followProbe.props).toMatchObject({ following: true, spanM: 12, interactive: false })
    act(() => followProbe.props!.onUserMove?.())
    draw('mini')
    expect(followProbe.props!.following).toBe(true)
    expect(followButton()).toBeNull()
  })

  it('a drag pauses it, Follow robot appears, and pressing it resumes with a fresh frame', () => {
    draw()
    const epoch = followProbe.props!.epoch
    act(() => followProbe.props!.onUserMove?.())
    expect(followProbe.props!.following).toBe(false)
    expect(followButton()!.textContent).toBe('Follow robot')
    act(() => followButton()!.click())
    expect(followProbe.props!.following).toBe(true)
    expect(followProbe.props!.epoch).toBe(epoch + 1)
    expect(followButton()).toBeNull()
  })

  it('a small map, which has no tools, still gets the button', () => {
    tools.compact = true
    draw()
    act(() => followProbe.props!.onUserMove?.())
    expect(followButton()).not.toBeNull()
    expect(followButton()!.style.right).toBe('12px')
  })

  it('switching robots follows the new one, even after a pause', () => {
    draw()
    act(() => followProbe.props!.onUserMove?.())
    const epoch = followProbe.props!.epoch
    act(() => root.render(<MapCanvas robot={{ robot_id: 'r2' } as RobotState} map={map} variant="full" />))
    expect(followProbe.props!.following).toBe(true)
    expect(followProbe.props!.epoch).toBe(epoch + 1)
    expect(followButton()).toBeNull()
  })
})

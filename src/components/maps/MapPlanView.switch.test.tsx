// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import i18n from 'i18next'
import { mockMaps } from '@/mocks/maps'
import type { MapSceneProps } from '@/components/scene/mapSceneProps'
import type { PlanView } from './planView'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The Map page's Flat / 3D / Point cloud switch (operator, 2026-11-26): out of
// the page header, into the map's top-right corner, where in 3D it is the last
// item of the scene's own row (Tilt, Reset view, Full screen) and over Flat
// and Point cloud it stands alone in the same place. Leaflet, three.js and the
// robots are stood in for: their own tests cover them.

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="leaflet">{children}</div>,
  useMap: () => ({ fitBounds: () => {} }),
}))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({ FloorplanLayer: () => null }))
vi.mock('@/components/liveops/map/RobotMarker', () => ({ RobotMarker: () => null }))
vi.mock('@/components/liveops/map/ClassicRobotMarker', () => ({ ClassicRobotMarker: () => null }))
vi.mock('@/components/liveops/map/HomeMarker', () => ({ HomeMarker: () => null }))
vi.mock('@/components/liveops/map/NavGoalLayer', () => ({ NavGoalMarkers: () => null, NavMapInput: () => null }))
vi.mock('./ZoneEditor', () => ({ ZoneDrawLayers: () => null }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => [] }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { mapArtifactUrl: () => '' } }))
const sceneData = vi.hoisted(() => ({ status: 'ready' as string }))
vi.mock('@/scene3d/useSceneData', () => ({
  useSceneData: () => (sceneData.status === 'ready'
    ? { status: 'ready', data: { mapId: 'm', floorIndex: 0, floorZ: 0, grid: null, hasPlanning: true, cloud: null } }
    : { status: sceneData.status, data: null }),
}))
vi.mock('@/liveops/contentBounds', () => ({ contentBoundsM: () => null }))
// The scene, as the page hands it over: its top-right row holds the host's switch.
const scene = vi.hoisted(() => ({ props: null as null | MapSceneProps }))
vi.mock('@/components/scene/MapSceneLazy', () => ({
  MapSceneLazy: (p: MapSceneProps) => {
    scene.props = p
    return <div data-testid="scene"><div data-scene-row="top-right">{p.viewSwitch}</div></div>
  },
}))

import { MapPlanView } from './MapPlanView'

const map = mockMaps[0]
let container: HTMLDivElement
let root: Root
let onViewChange: ReturnType<typeof vi.fn>

function render(view: PlanView, { drawing = null as unknown, picking = false } = {}) {
  const draft = { zones: [], drawing, onVertex: () => {}, finish: () => {} } as never
  const home = { picking, pose: null, onPress: () => {}, onDrag: () => {}, onRelease: () => {}, cancel: () => {} } as never
  act(() => root.render(
    <MapPlanView map={map} floorIndex={map.floors[0].index} view={view} onViewChange={onViewChange} draft={draft} home={home} />,
  ))
}
const theSwitch = () => container.querySelector<HTMLElement>('[data-view-switch]')!
const button = (v: PlanView) => theSwitch().querySelector<HTMLButtonElement>(`button[data-plan-view="${v}"]`)!
const corner = () => theSwitch().closest<HTMLElement>('[data-scene-host-switch]')!

beforeEach(() => {
  sceneData.status = 'ready'
  scene.props = null
  onViewChange = vi.fn()
  void i18n.changeLanguage('en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the Map page view switch', () => {
  it('sits in the top-right corner over Flat, and chooses the view', () => {
    render('2d')
    expect(container.querySelectorAll('[data-view-switch]')).toHaveLength(1)
    expect(theSwitch().getAttribute('aria-label')).toBe('Map view')
    expect([...theSwitch().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Flat', '3D', 'Point cloud'])
    expect(button('2d').getAttribute('aria-pressed')).toBe('true')
    // Over Leaflet's panes (1000), in the scene's corner.
    expect(corner().style.top).toBe('12px')
    expect(corner().style.right).toBe('12px')
    expect(Number(corner().style.zIndex)).toBeGreaterThan(1000)
    act(() => button('scene').click())
    expect(onViewChange).toHaveBeenCalledWith('scene')
  })

  it('in 3D joins the scene’s top-right row, and the tilt button is called Tilt', () => {
    render('scene')
    expect(container.querySelectorAll('[data-view-switch]')).toHaveLength(1)
    expect(theSwitch().closest('[data-scene-row="top-right"]')).not.toBeNull()
    expect(button('scene').getAttribute('aria-pressed')).toBe('true')
    // Only one "3D" in the row: the scene's own is renamed here.
    expect(scene.props!.tiltLabel).toBe('Tilt')
    expect(scene.props!.showTilt).not.toBe(false)
  })

  it('stands in the same corner over Point cloud', () => {
    render('cloud')
    expect(container.querySelector('[data-testid="scene"]')).toBeNull()
    expect(button('cloud').getAttribute('aria-pressed')).toBe('true')
    expect(corner().style.top).toBe('12px')
    expect(corner().style.right).toBe('12px')
  })

  it('stays reachable in 3D while the floor has no scene to show', () => {
    sceneData.status = 'loading'
    render('scene')
    expect(container.querySelector('[data-testid="scene"]')).toBeNull()
    expect(corner()).not.toBeNull()
    act(() => button('2d').click())
    expect(onViewChange).toHaveBeenCalledWith('2d')
  })

  it('is held on Flat while a zone is drawn, with the reason as its tooltip', () => {
    render('scene', { drawing: { kind: 'no_go', vertices: [] } })
    expect(container.querySelector<HTMLElement>('[data-map-plan]')!.dataset.view).toBe('2d')
    expect(theSwitch().dataset.viewSwitch).toBe('2d')
    expect(theSwitch().dataset.viewHeld).toBe('drawing')
    expect(theSwitch().title).toBe('Flat while you draw a zone')
    expect(button('scene').disabled).toBe(true)
    expect(button('cloud').disabled).toBe(true)
    expect(button('cloud').title).toBe('Flat while you draw a zone')
    expect(button('2d').disabled).toBe(false)
    // The choice comes back when drawing ends.
    render('scene')
    expect(theSwitch().dataset.viewSwitch).toBe('scene')
    expect(theSwitch().dataset.viewHeld).toBeUndefined()
  })

  it('is held on Flat while home is picked, with the reason as its tooltip', () => {
    render('cloud', { picking: true })
    expect(theSwitch().dataset.viewHeld).toBe('picking')
    expect(theSwitch().title).toBe('Flat while you pick home')
    expect(button('cloud').disabled).toBe(true)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapSceneProps } from '@/components/scene/mapSceneProps'
import type { SceneData } from '@/scene3d/types'
import type { MissionWaypoint } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The scene stood in: WebGL does not exist in jsdom, and MapScene's own wiring
// is MapScene.test's. This file covers what RouteScene adds: the remembered view.
const seam = vi.hoisted(() => ({ props: undefined as MapSceneProps | undefined, renders: 0 }))
vi.mock('@/components/scene/MapSceneLazy', () => ({
  MapSceneLazy: (p: MapSceneProps) => { seam.props = p; seam.renders += 1; return <div data-view={p.view} /> },
}))

import { ROUTE_SCENE_VIEW_KEY, RouteScene, readStoredView } from './RouteScene'

const data = { mapId: 'm', floorIndex: 0, floorZ: 0, cloud: null, hasPlanning: false } as unknown as SceneData
const wp: MissionWaypoint = {
  waypoint_id: 'a', label: 'A', x_m: 1, y_m: 2, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending',
}
const WAYPOINTS = [wp]
const NONE = {}

let root: Root | null = null
let host: HTMLDivElement | null = null
function mount(): void {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(
      <RouteScene
        data={data} zones={[]} waypoints={WAYPOINTS} flags={NONE} notes={NONE}
        selectedId={null} onSelect={() => {}} place={() => {}} frameKey="m1"
      />,
    )
  })
}
function unmount(): void {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
}

beforeEach(() => { localStorage.clear(); seam.props = undefined; seam.renders = 0 })
afterEach(() => { unmount(); vi.unstubAllGlobals() })

describe('the route scene remembers the last view, per browser', () => {
  it('starts in Plan when nothing is stored', () => {
    mount()
    expect(seam.props!.view).toBe('plan')
  })

  it('stores a view change and starts there next time', () => {
    mount()
    act(() => seam.props!.onViewChange('fly'))
    expect(seam.props!.view).toBe('fly')
    expect(localStorage.getItem(ROUTE_SCENE_VIEW_KEY)).toBe('fly')
    unmount()
    mount()
    expect(seam.props!.view).toBe('fly')
  })

  it.each(['', 'orbit', 'PLAN', '{"view":"fly"}'])('treats a stored %j as Plan', (stored) => {
    localStorage.setItem(ROUTE_SCENE_VIEW_KEY, stored)
    expect(readStoredView()).toBe('plan')
    mount()
    expect(seam.props!.view).toBe('plan')
  })

  it('renders in Plan, and still changes view, when storage throws', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    vi.stubGlobal('localStorage', throwing)
    mount()
    expect(seam.props!.view).toBe('plan')
    act(() => seam.props!.onViewChange('follow'))
    expect(seam.props!.view).toBe('follow')
  })

  it('keeps the route identity across re-renders that do not change it', () => {
    mount()
    const first = seam.props!.route
    act(() => seam.props!.onViewChange('fly'))
    expect(seam.renders).toBeGreaterThan(1)
    expect(seam.props!.route).toBe(first)
  })
})

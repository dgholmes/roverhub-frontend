// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import i18n from 'i18next'
import type { SceneData } from '@/scene3d/types'
import type { MapSceneProps } from './mapSceneProps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The engine stood in: WebGL does not exist in jsdom. Records every call. */
const engines = vi.hoisted(() => ({
  list: [] as Array<{ calls: [string, unknown[]][]; cb: Record<string, (...a: unknown[]) => void>; data: unknown; disposed: boolean }>,
  webgl: true,
}))
vi.mock('@/scene3d/engine/SceneEngine', () => {
  class FakeEngine {
    calls: [string, unknown[]][] = []
    cb: Record<string, (...a: unknown[]) => void> = {}
    disposed = false
    constructor(public data: unknown) {}
    static create(_host: HTMLElement, _labels: HTMLElement, data: unknown) {
      if (!engines.webgl) return null
      const e = new FakeEngine(data)
      engines.list.push(e)
      return new Proxy(e, {
        get(target, prop: string) {
          if (prop in target) return (target as unknown as Record<string, unknown>)[prop]
          return (...args: unknown[]) => { target.calls.push([prop, args]) }
        },
      })
    }
    setCallbacks(cb: Record<string, (...a: unknown[]) => void>) { this.cb = cb }
    getStatus() { return { detached: false, hasRobot: false, previewing: false } }
    dispose() { this.disposed = true }
  }
  return { SceneEngine: FakeEngine }
})

import { MapScene } from './MapScene'

const grid = {
  w: 4, h: 4, res: 0.5, origin: [0, 0] as [number, number], bits: new Uint8Array(16).fill(9),
  content: { minX: 0, minY: 0, maxX: 3, maxY: 3 },
}
const withCloud: SceneData = {
  mapId: 'm', floorIndex: 0, floorZ: 0, grid, hasPlanning: true,
  cloud: { count: 2, xyh: new Float32Array(6), cls: new Uint8Array(2) },
}
const noCloud: SceneData = { ...withCloud, cloud: null }

let container: HTMLDivElement
let root: Root

function render(over: Partial<MapSceneProps> = {}) {
  const props: MapSceneProps = {
    data: withCloud, views: ['plan', 'fly', 'follow'], view: 'plan', onViewChange: () => {},
    followTarget: 'standin', pointerMode: 'tap', ...over,
  }
  act(() => root.render(<MapScene {...props} />))
  return props
}
const engine = () => engines.list[engines.list.length - 1]
const callsOf = (name: string) => engine().calls.filter(([n]) => n === name).map(([, a]) => a)
const lastCall = (name: string) => { const c = callsOf(name); return c[c.length - 1] }
const viewButtons = () => [...container.querySelectorAll<HTMLButtonElement>('button[data-view]')]

beforeEach(() => {
  engines.list = []
  engines.webgl = true
  void i18n.changeLanguage('en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('MapScene', () => {
  it('shows only the views it is given, in order', () => {
    render({ views: ['plan', 'fly'] })
    expect(viewButtons().map((b) => b.dataset.view)).toEqual(['plan', 'fly'])
    expect(viewButtons().map((b) => b.textContent)).toEqual(['Plan', 'Fly'])
  })

  it('hides its view switch when the host draws its own', () => {
    render({ showViewSwitch: false })
    expect(viewButtons()).toHaveLength(0)
  })

  it('asks the host to change view', () => {
    const onViewChange = vi.fn()
    render({ onViewChange })
    act(() => viewButtons()[1].click())
    expect(onViewChange).toHaveBeenCalledWith('fly')
  })

  it('disables Fly and Follow without a cloud, says why, and shows Plan instead', () => {
    const onViewChange = vi.fn()
    render({ data: noCloud, view: 'fly', onViewChange })
    const [plan, fly, follow] = viewButtons()
    expect(plan.disabled).toBe(false)
    expect(fly.disabled).toBe(true)
    expect(follow.disabled).toBe(true)
    expect(fly.title).toMatch(/no point cloud/i)
    expect(lastCall('setView')).toEqual(['plan'])
    expect(plan.getAttribute('aria-pressed')).toBe('true')
  })

  it('forwards every overlay and mode to the engine', () => {
    const route = [{ id: 'w1', x: 1, y: 2, label: 'Door' }]
    const robot = { x: 1, y: 1, yaw: 0.5, stale: true }
    const goal = { x: 3, y: 3 }
    const poseDraft = { x: 2, y: 2, yaw: 1 }
    const zones = [{ id: 'z', kind: 'no_go' as const, points: [[0, 0], [1, 0], [1, 1]] as [number, number][] }]
    const scan = new Float32Array([1, 2])
    render({
      route, selectedWaypointId: 'w1', robot, goal, goalLine: true, poseDraft, zones, scan,
      pointerMode: 'pose', followTarget: 'robot', view: 'follow',
    })
    expect(lastCall('setRoute')).toEqual([route, 'w1'])
    expect(lastCall('setRobot')).toEqual([robot])
    expect(lastCall('setGoal')).toEqual([goal, true])
    expect(lastCall('setPoseDraft')).toEqual([poseDraft])
    expect(lastCall('setZones')).toEqual([zones])
    expect(lastCall('setScan')).toEqual([scan])
    expect(lastCall('setPointerMode')).toEqual(['pose'])
    expect(lastCall('setFollowTarget')).toEqual(['robot'])
    expect(lastCall('setView')).toEqual(['follow'])
  })

  it('re-frames when frameKey changes, and not otherwise', () => {
    render({ frameKey: 'a' })
    expect(callsOf('frame')).toHaveLength(1)
    render({ frameKey: 'a', goalLine: true })
    expect(callsOf('frame')).toHaveLength(1)
    render({ frameKey: 'b' })
    expect(callsOf('frame')).toHaveLength(2)
  })

  it('wires the engine callbacks to the host', () => {
    const onFloorTap = vi.fn(), onWaypointClick = vi.fn(), onStandinWaypoint = vi.fn()
    const onFloorPoseDown = vi.fn(), onFloorPoseMove = vi.fn(), onFloorPoseUp = vi.fn()
    render({ onFloorTap, onWaypointClick, onStandinWaypoint, onFloorPoseDown, onFloorPoseMove, onFloorPoseUp })
    const cb = engine().cb
    cb.onFloorTap(1, 2)
    cb.onWaypointClick('w1')
    cb.onStandinWaypoint(3, 4)
    cb.onFloorPoseDown(5, 6); cb.onFloorPoseMove(7, 8); cb.onFloorPoseUp(9, 10)
    expect(onFloorTap).toHaveBeenCalledWith(1, 2)
    expect(onWaypointClick).toHaveBeenCalledWith('w1')
    expect(onStandinWaypoint).toHaveBeenCalledWith(3, 4)
    expect(onFloorPoseDown).toHaveBeenCalledWith(5, 6)
    expect(onFloorPoseMove).toHaveBeenCalledWith(7, 8)
    expect(onFloorPoseUp).toHaveBeenCalledWith(9, 10)
  })

  it('calls the latest handler, not the one from the first render', () => {
    const first = vi.fn(), second = vi.fn()
    render({ onFloorTap: first })
    render({ onFloorTap: second })
    engine().cb.onFloorTap(1, 1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(1, 1)
    expect(engines.list).toHaveLength(1)
  })

  it('tilts on its own when uncontrolled, and reports it either way', () => {
    const onTiltChange = vi.fn()
    render({ onTiltChange })
    act(() => engine().cb.onTiltRequest(true))
    expect(onTiltChange).toHaveBeenCalledWith(true)
    expect(lastCall('setTilted')).toEqual([true])
  })

  it('leaves a controlled tilt to the host', () => {
    const onTiltChange = vi.fn()
    render({ tilted: false, onTiltChange })
    act(() => engine().cb.onTiltRequest(true))
    expect(onTiltChange).toHaveBeenCalledWith(true)
    expect(lastCall('setTilted')).toEqual([false])
    render({ tilted: true, onTiltChange })
    expect(lastCall('setTilted')).toEqual([true])
    const tilt = [...container.querySelectorAll('button')].find((b) => b.textContent === '3D')!
    expect(tilt.getAttribute('aria-pressed')).toBe('true')
  })

  it('offers Back to robot once Follow has let go of a known robot, and says why when there is none', () => {
    render({ view: 'follow', followTarget: 'robot' })
    expect(container.textContent).toMatch(/No robot position yet/)
    act(() => engine().cb.onStatus({ detached: true, hasRobot: true, previewing: false }))
    const back = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Back to robot')!
    expect(back).toBeTruthy()
    act(() => back.click())
    expect(callsOf('reattach')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/No robot position yet/)
  })

  it('offers Preview and the camera inset only in Follow on the stand-in', () => {
    render({ view: 'follow', followTarget: 'standin', route: [{ id: 'a', x: 0, y: 0, label: 'A' }, { id: 'b', x: 1, y: 0, label: 'B' }] })
    const preview = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Preview run')!
    expect(preview.disabled).toBe(false)
    act(() => preview.click())
    expect(callsOf('togglePreview')).toHaveLength(1)
    expect(container.querySelector('[data-testid="scene-pip"]')).not.toBeNull()
    render({ view: 'follow', followTarget: 'robot' })
    expect(container.querySelector('[data-testid="scene-pip"]')).toBeNull()
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Preview run')).toBe(false)
  })

  it('shows the engine’s toasts', () => {
    render()
    act(() => engine().cb.onToast('bump'))
    expect(container.textContent).toMatch(/Edge of the walkable area/)
  })

  it('builds a new engine for new data and disposes the old one', () => {
    render()
    const first = engines.list[0]
    render({ data: { ...withCloud, floorIndex: 1 } })
    expect(engines.list).toHaveLength(2)
    expect(first.disposed).toBe(true)
  })

  it('says so instead of throwing when WebGL is not available', () => {
    engines.webgl = false
    render()
    expect(container.textContent).toMatch(/needs WebGL/)
    expect(container.querySelector('[data-testid="map-scene"]')).toBeNull()
  })

  it('lists the keys for the view', () => {
    render({ view: 'fly' })
    expect(container.querySelector('details')?.textContent).toMatch(/Look around/)
  })

  it('offers full screen unless the host forbids it', () => {
    const offered = () => [...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Full screen'))
    render()
    expect(offered()).toBe(true)
    render({ allowFullscreen: false })
    expect(offered()).toBe(false)
  })

  // The Map page's view controls (operator, 2026-11-26): one row at the top
  // right, and the Show / Colour / Points groups on the Plan | Fly row.
  it('lays a host view switch last in the top-right row, after Reset view and Full screen', () => {
    render({ viewSwitch: <div data-testid="host-switch">Flat 3D Point cloud</div> })
    const row = container.querySelector<HTMLElement>('[data-scene-row="top-right"]')!
    const host = row.querySelector('[data-testid="host-switch"]')!
    expect(host).not.toBeNull()
    // Last in the row, so it sits at the corner where the page draws it over its other views.
    expect(row.lastElementChild!.contains(host)).toBe(true)
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual(['3D', 'Reset view', 'Full screen'])
    // Not in the toolbar on the left.
    expect(container.querySelector('[data-testid="scene-toolbar"] [data-testid="host-switch"]')).toBeNull()
  })

  it('keeps the host view switch when there is no WebGL, so the way out is still there', () => {
    engines.webgl = false
    render({ viewSwitch: <div data-testid="host-switch" /> })
    expect(container.querySelector('[data-testid="host-switch"]')).not.toBeNull()
  })

  it('calls the tilt button what the host says, "3D" by default, and can drop it', () => {
    const tilt = () => container.querySelector<HTMLButtonElement>('[data-scene-tilt]')
    render()
    expect(tilt()!.textContent).toBe('3D')
    render({ tiltLabel: 'Tilt' })
    expect(tilt()!.textContent).toBe('Tilt')
    expect(tilt()!.title).toBe('Tilt the plan into 3D (T)')
    render({ showTilt: false })
    expect(tilt()).toBeNull()
  })

  it('puts the views, the mode and the Show / Colour / Points groups in one wrapping row', () => {
    render({ view: 'fly', views: ['plan', 'fly'] })
    const bar = container.querySelector<HTMLElement>('[data-testid="scene-toolbar"]')!
    expect(bar.style.display).toBe('flex')
    expect(bar.style.flexWrap).toBe('wrap')
    expect([...bar.children].map((c) => (c as HTMLElement).dataset.sceneGroup)).toEqual(['views', 'mode', 'show', 'colour', 'points'])
    // The right-hand controls share the same top row, and drop under it only when they must.
    const top = container.querySelector<HTMLElement>('[data-scene-top]')!
    expect(top.style.flexWrap).toBe('wrap')
    expect(bar.parentElement).toBe(top)
    expect(container.querySelector('[data-scene-right]')!.parentElement).toBe(top)
  })

  it('says to click the map in the Keys box, not in a row under the toolbar', () => {
    render()
    const hint = container.querySelector('[data-scene-focus-hint]')!
    expect(hint.textContent).toBe('Click the map to use the keys')
    expect(hint.closest('summary')).not.toBeNull()
    expect(container.querySelector('[data-testid="scene-toolbar"]')!.textContent).not.toContain('Click the map')
  })

  it('lays its controls inside the host insets', () => {
    render({ insets: { top: 50, left: 276 } })
    const boxes = [...container.querySelectorAll<HTMLElement>('[data-scene-ui]')]
    expect(boxes.some((b) => b.style.top === '62px' && b.style.left === '288px')).toBe(true)
  })
})

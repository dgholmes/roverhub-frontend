// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapSceneProps } from '@/components/scene/mapSceneProps'
import type { ScanSample, ScanVisibility } from '@/liveops/scanFrame'
import type { SceneData } from '@/scene3d/types'
import type { Mission, RobotState } from '@/types'
import type { MapZone, Point2D } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The scene itself is stood in: it records the props it was last given, which
// is the whole contract between LiveOps and the scene.
const scene = vi.hoisted(() => ({ props: null as MapSceneProps | null, renders: 0 }))
vi.mock('@/components/scene/MapSceneLazy', () => ({
  MapSceneLazy: (p: MapSceneProps) => { scene.props = p; scene.renders++; return <div data-testid="scene" /> },
}))
const lidar = vi.hoisted(() => ({ sample: null as ScanSample | null, visibility: 'hidden' as ScanVisibility }))
vi.mock('./useLiveScan', () => ({
  useLatestScan: () => lidar.sample,
  useScanVisibility: () => lidar.visibility,
}))

import { LiveScene, sceneGoalOf, scenePoseDraftOf, scenePoseOf, type LiveSceneProps } from './LiveScene'

const data = { mapId: 'm1', floorIndex: 0 } as SceneData
const position = (over: Partial<RobotState['position']> = {}) => ({
  x_m: 2, y_m: -1, z_m: 0, heading_deg: 90, provider: 'slam', quality: 'localized', accuracy_m: null,
  freshness: 'live', updated_at: '', ...over,
}) as RobotState['position']
const robotWith = (over: Partial<RobotState['position']> = {}) => ({ robot_id: 'r1', position: position(over) }) as RobotState
const zones: MapZone[] = [
  { zone_id: 'g', map_id: 'm1', kind: 'geofence', label: 'Site', polygon: [[0, 0], [9, 0], [9, 9]] },
  { zone_id: 'n', map_id: 'm1', kind: 'no_go', label: 'Lab', polygon: [[1, 1], [2, 1], [2, 2]] },
  { zone_id: 's', map_id: 'm1', kind: 'stairs', label: 'Stairs', polygon: [[3, 3], [4, 3], [4, 4]] },
]
const mission = {
  waypoints: [
    { waypoint_id: 'w1', label: 'Door', x_m: 1, y_m: 2, status: 'done' },
    { waypoint_id: 'w2', label: 'Desk', x_m: 3, y_m: 4, status: 'pending' },
  ],
} as unknown as Mission

const handlers = () => ({
  onTap: vi.fn<(p: Point2D) => void>(), onPress: vi.fn<(p: Point2D) => void>(),
  onDrag: vi.fn<(p: Point2D) => void>(), onRelease: vi.fn<(p: Point2D) => void>(), onEscape: vi.fn(),
})
type Handlers = ReturnType<typeof handlers>

let host: HTMLDivElement
let root: Root
let h: Handlers

function render(over: Partial<LiveSceneProps> & { mode?: 'idle' | 'go' | 'setPosition' } = {}) {
  const { mode = 'idle', ...rest } = over
  const props: LiveSceneProps = {
    data, view: '3d', onViewChange: vi.fn(), robot: robotWith(), mapId: 'm1', zones,
    layers: { geofence: true, noGoZones: true, lidar: true },
    markers: { from: { x_m: 2, y_m: -1 }, pending: null, pendingRefused: false, walking: null, pose: null },
    input: { mode, ...h },
    ...rest,
  }
  act(() => root.render(<LiveScene {...props} />))
  return props
}
const p = () => scene.props!

beforeEach(() => {
  scene.props = null
  scene.renders = 0
  lidar.sample = null
  lidar.visibility = 'hidden'
  h = handlers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('LiveScene pointer: the same nav actions as the flat map', () => {
  it('Go mode: a floor tap reaches onTap with exactly that map point', () => {
    render({ mode: 'go' })
    expect(p().pointerMode).toBe('tap')
    p().onFloorTap!(1.234, -5.678)
    expect(h.onTap).toHaveBeenCalledTimes(1)
    expect(h.onTap).toHaveBeenCalledWith([1.234, -5.678])
    expect(p().onFloorPoseDown).toBeUndefined()
  })

  it('Set position: camera drag off, and press, drag and release are the pose', () => {
    render({ mode: 'setPosition' })
    expect(p().pointerMode).toBe('pose')
    expect(p().onFloorTap).toBeUndefined()
    p().onFloorPoseDown!(1, 2)
    p().onFloorPoseMove!(1.5, 2.5)
    p().onFloorPoseUp!(2, 3)
    expect(h.onPress).toHaveBeenCalledWith([1, 2])
    expect(h.onDrag).toHaveBeenCalledWith([1.5, 2.5])
    expect(h.onRelease).toHaveBeenCalledWith([2, 3])
    expect(h.onTap).not.toHaveBeenCalled()
  })

  it('idle: the floor sends nothing', () => {
    render({ mode: 'idle' })
    expect(p().pointerMode).toBe('tap')
    expect(p().onFloorTap).toBeUndefined()
    expect(p().onFloorPoseDown).toBeUndefined()
    expect(p().onFloorPoseMove).toBeUndefined()
    expect(p().onFloorPoseUp).toBeUndefined()
  })

  it('leaving Go mode takes the tap handler with it', () => {
    render({ mode: 'go' })
    const stale = p().onFloorTap
    expect(stale).toBeDefined()
    render({ mode: 'idle' })
    expect(p().onFloorTap).toBeUndefined()
  })

  it('Esc leaves a mode, as on the flat map, and does nothing when idle', () => {
    render({ mode: 'idle' })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(h.onEscape).not.toHaveBeenCalled()
    render({ mode: 'go' })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(h.onEscape).toHaveBeenCalledTimes(1)
    render({ mode: 'setPosition' })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(h.onEscape).toHaveBeenCalledTimes(2)
  })

  it('shows a crosshair while a mode is on', () => {
    render({ mode: 'go' })
    expect(p().style?.cursor).toBe('crosshair')
    render({ mode: 'idle' })
    expect(p().style?.cursor).toBeUndefined()
  })
})

describe('LiveScene views', () => {
  it('3D is the scene\'s plan, tilted, with its own switch hidden and the robot followed', () => {
    render({ view: '3d' })
    expect(p().view).toBe('plan')
    expect(p().tilted).toBe(true)
    expect(p().showViewSwitch).toBe(false)
    expect(p().views).toEqual(['plan', 'fly', 'follow'])
    expect(p().followTarget).toBe('robot')
  })

  it('Fly and Follow pass through', () => {
    render({ view: 'fly' })
    expect(p().view).toBe('fly')
    render({ view: 'follow' })
    expect(p().view).toBe('follow')
  })

  it('flattening the tilt (T, the 3D button, Reset view) returns to the flat Plan', () => {
    const onViewChange = vi.fn()
    render({ view: '3d', onViewChange })
    p().onTiltChange!(false)
    expect(onViewChange).toHaveBeenCalledWith('plan')
    p().onTiltChange!(true)
    expect(onViewChange).toHaveBeenCalledTimes(1)
  })
})

describe('LiveScene overlays', () => {
  it('turns the robot heading (degrees anticlockwise from +x) into yaw radians', () => {
    expect(scenePoseOf(robotWith({ heading_deg: 90 }))!.yaw).toBeCloseTo(Math.PI / 2)
    expect(scenePoseOf(robotWith({ heading_deg: -45 }))!.yaw).toBeCloseTo(-Math.PI / 4)
    expect(scenePoseOf(robotWith({ heading_deg: 180 }))).toMatchObject({ x: 2, y: -1, stale: false, estimated: true })
    render()
    expect(p().robot).toMatchObject({ x: 2, y: -1 })
    expect(p().robot!.yaw).toBeCloseTo(Math.PI / 2)
  })

  it('marks the robot stale when its telemetry is not live, and draws none without a position', () => {
    expect(scenePoseOf(robotWith({ freshness: 'stale' }))!.stale).toBe(true)
    expect(scenePoseOf({ position: undefined as unknown as RobotState['position'] })).toBeNull()
    expect(scenePoseOf(robotWith({ x_m: NaN }))).toBeNull()
  })

  it('maps the goal markers: a refused pin is red with no line, a walk has its line', () => {
    const from = { x_m: 0, y_m: 0 }
    expect(sceneGoalOf({ from, pending: [3, 4], pendingRefused: false, walking: null }))
      .toEqual({ goal: { x: 3, y: 4, refused: false }, line: true })
    expect(sceneGoalOf({ from, pending: [3, 4], pendingRefused: true, walking: null }))
      .toEqual({ goal: { x: 3, y: 4, refused: true }, line: false })
    expect(sceneGoalOf({ from, pending: null, pendingRefused: false, walking: { x_m: 5, y_m: 6 } }))
      .toEqual({ goal: { x: 5, y: 6 }, line: true })
    expect(sceneGoalOf({ from: null, pending: [3, 4], pendingRefused: false, walking: null }).line).toBe(false)
    expect(sceneGoalOf({ from, pending: null, pendingRefused: false, walking: null })).toEqual({ goal: null, line: false })
  })

  it('shows the Set-position draft only once the drag gives it a heading', () => {
    expect(scenePoseDraftOf(null)).toBeNull()
    expect(scenePoseDraftOf({ at: [1, 1], toward: [1, 1] })).toBeNull()
    const d = scenePoseDraftOf({ at: [1, 1], toward: [1, 3] })!
    expect(d).toMatchObject({ x: 1, y: 1 })
    expect(d.yaw).toBeCloseTo(Math.PI / 2)
  })

  it('draws the zones the layer switches allow, stairs with the no-go zones', () => {
    render()
    expect(p().zones!.map((z) => z.id)).toEqual(['g', 'n', 's'])
    render({ layers: { geofence: false, noGoZones: true, lidar: true } })
    expect(p().zones!.map((z) => z.id)).toEqual(['n', 's'])
    render({ layers: { geofence: true, noGoZones: false, lidar: true } })
    expect(p().zones!.map((z) => z.id)).toEqual(['g'])
  })

  it("draws the mission's waypoints as the route", () => {
    render({ mission })
    expect(p().route).toEqual([
      { id: 'w1', x: 1, y: 2, label: 'Door' },
      { id: 'w2', x: 3, y: 4, label: 'Desk' },
    ])
    render({ mission: undefined })
    expect(p().route).toEqual([])
  })

  it('hands over the live lidar as x,y pairs while the layer is on and the frame is drawable', () => {
    lidar.sample = { receivedAt: 0, frame: { points: [[1, 2], [3, 4]] } } as unknown as ScanSample
    lidar.visibility = 'live'
    render()
    expect(Array.from(p().scan!)).toEqual([1, 2, 3, 4])
    render({ layers: { geofence: true, noGoZones: true, lidar: false } })
    expect(p().scan).toBeNull()
    lidar.visibility = 'hidden'
    render()
    expect(p().scan).toBeNull()
  })

  it('keeps every overlay the same object across a telemetry frame that moved only the robot', () => {
    lidar.sample = { receivedAt: 0, frame: { points: [[1, 2]] } } as unknown as ScanSample
    lidar.visibility = 'live'
    const markers = { from: { x_m: 2, y_m: -1 }, pending: [3, 4] as Point2D, pendingRefused: false, walking: null, pose: null }
    render({ mission, markers })
    const first = p()
    // A new robot object, a new mission object with the same waypoints and new
    // marker objects, as a telemetry frame brings.
    render({
      mission: { ...mission, waypoints: mission.waypoints.map((w) => ({ ...w })) },
      markers: { ...markers, from: { x_m: 2.1, y_m: -1 } },
      robot: robotWith({ x_m: 2.1 }),
    })
    const next = p()
    expect(next.route).toBe(first.route)
    expect(next.zones).toBe(first.zones)
    expect(next.scan).toBe(first.scan)
    expect(next.goal).toBe(first.goal)
    expect(next.robot).not.toBe(first.robot)
    expect(next.robot!.x).toBe(2.1)
  })
})

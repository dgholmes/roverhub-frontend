// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import L from 'leaflet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** One fake Leaflet map per test, shared with the component through useMap. */
let map: FakeMap

vi.mock('react-leaflet', () => ({ useMap: () => map }))

import { FollowRobot } from './FollowRobot'
import { FOLLOW_SPAN_M, followZoom } from '@/liveops/mapFollow'
import type { RobotState } from '@/types'

type Handler = () => void

/**
 * Enough of a CRS.Simple map to follow a robot on: 2^zoom px per metre, map
 * y up, so project([lat, lng], z) = (lng, -lat) * 2^z. The view is a centre
 * and a zoom, and container points are measured from the pane's top-left.
 */
class FakeMap {
  size = L.point(800, 512)
  zoom = 3
  centre = L.latLng(0, 0)
  options: Record<string, unknown> = { zoomSnap: 0.25, scrollWheelZoom: true, touchZoom: true, doubleClickZoom: true }
  setView = vi.fn((c: L.LatLng, z: number, _opts?: L.ZoomPanOptions) => { this.centre = L.latLng(c.lat, c.lng); this.zoom = z })
  panTo = vi.fn()
  fitBounds = vi.fn()
  setZoom = vi.fn()
  getSize = () => this.size
  getZoom = () => this.zoom
  getMinZoom = () => 1
  getMaxZoom = () => 7
  getContainer = () => undefined
  invalidateSize = vi.fn()
  project = (ll: L.LatLngExpression, z: number) => {
    const p = L.latLng(ll)
    return L.point(p.lng * 2 ** z, -p.lat * 2 ** z)
  }
  unproject = (pt: L.Point, z: number) => L.latLng(-pt.y / 2 ** z, pt.x / 2 ** z)
  latLngToContainerPoint = (ll: L.LatLngExpression) => {
    const p = this.project(ll, this.zoom)
    const c = this.project(this.centre, this.zoom)
    return p.subtract(c).add(L.point(this.size.x / 2, this.size.y / 2))
  }
  private handlers = new Map<string, Set<Handler>>()
  on = vi.fn((event: string, fn: Handler) => {
    const set = this.handlers.get(event) ?? new Set()
    set.add(fn)
    this.handlers.set(event, set)
  })
  off = vi.fn((event: string, fn: Handler) => { this.handlers.get(event)?.delete(fn) })
  fire(event: string) { for (const fn of [...(this.handlers.get(event) ?? [])]) fn() }
  /** Where the robot is drawn on the pane now. */
  robotPx(r: RobotState) { return this.latLngToContainerPoint(L.latLng(r.position.y_m, r.position.x_m)) }
}

const robotAt = (x_m: number, y_m: number, robot_id = 'r1'): RobotState =>
  ({ robot_id, position: { x_m, y_m } } as RobotState)

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  map = new FakeMap()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

interface Props {
  robot: RobotState
  following?: boolean
  epoch?: number
  interactive?: boolean
  padding?: { topLeft: [number, number]; bottomRight: [number, number] }
  onUserMove?: () => void
}

function render({ robot, following = true, epoch = 0, interactive = true, padding, onUserMove }: Props) {
  act(() => {
    root.render(
      <FollowRobot
        robot={robot} following={following} epoch={epoch} spanM={FOLLOW_SPAN_M}
        padding={padding} interactive={interactive} onUserMove={onUserMove}
      />,
    )
  })
}

describe('FollowRobot framing', () => {
  it('opens zoomed in on the robot and centred on it', () => {
    const r = robotAt(20, -5)
    render({ robot: r })
    expect(map.zoom).toBe(followZoom({ x: 800, y: 512 }, FOLLOW_SPAN_M))
    expect(map.zoom).toBe(6)   // 512 px / 8 m = 64 px per metre
    const at = map.robotPx(r)
    expect(at.x).toBeCloseTo(400)
    expect(at.y).toBeCloseTo(256)
  })

  it('centres the robot in what the panels leave visible, not under them', () => {
    const r = robotAt(0, 0)
    render({ robot: r, padding: { topLeft: [200, 0], bottomRight: [0, 0] } })
    // Visible: x 200..800, so the focus is x = 500.
    expect(map.robotPx(r).x).toBeCloseTo(500)
  })

  it('reframes on a new epoch: Follow robot restores the close-up', () => {
    render({ robot: robotAt(0, 0) })
    map.zoom = 2                      // the operator zoomed out while following
    render({ robot: robotAt(0, 0), epoch: 1 })
    expect(map.zoom).toBe(6)
  })

  it('does not frame while paused', () => {
    render({ robot: robotAt(0, 0), following: false })
    expect(map.setView).not.toHaveBeenCalled()
  })

  it('cannot frame a pane that has no size yet, and does once it has one', () => {
    map.size = L.point(0, 0)
    render({ robot: robotAt(3, 3) })
    expect(map.setView).not.toHaveBeenCalled()
    map.size = L.point(800, 512)
    render({ robot: robotAt(3, 3) })  // the next telemetry frame
    expect(map.zoom).toBe(6)
  })

  it('ignores a non-finite position', () => {
    render({ robot: robotAt(Number.NaN, 0) })
    render({ robot: robotAt(0, Number.POSITIVE_INFINITY) })
    expect(map.setView).not.toHaveBeenCalled()
  })
})

describe('FollowRobot following', () => {
  it('pans back onto a robot that walked out of the dead zone, at the same zoom', () => {
    render({ robot: robotAt(0, 0) })
    map.setView.mockClear()
    // 64 px per metre; the zone is 0.2 * 512 = 102 px, so 3 m (192 px) is out.
    const walked = robotAt(3, 0)
    render({ robot: walked })
    expect(map.setView).toHaveBeenCalledTimes(1)
    expect(map.zoom).toBe(6)
    expect(map.robotPx(walked).x).toBeCloseTo(400)
  })

  it('holds still while the robot stays near the middle', () => {
    render({ robot: robotAt(0, 0) })
    map.setView.mockClear()
    render({ robot: robotAt(1, 0.5) })
    expect(map.setView).not.toHaveBeenCalled()
  })

  it('follows a robot nobody is running a mission on', () => {
    // The bug of 2026-11-25: the full map followed only while active_run was
    // set, so driving by hand or tap-to-walk walked the robot off the map.
    const r = { ...robotAt(0, 0), active_run: null } as unknown as RobotState
    render({ robot: r })
    map.setView.mockClear()
    render({ robot: { ...r, position: { x_m: 5, y_m: 0 } } as RobotState })
    expect(map.setView).toHaveBeenCalled()
  })

  it('pans without animating, so a telemetry frame cannot queue up easing', () => {
    render({ robot: robotAt(0, 0) })
    expect(map.setView.mock.calls[0]?.[2]).toMatchObject({ animate: false })
  })

  it('never uses fitBounds', () => {
    render({ robot: robotAt(0, 0) })
    render({ robot: robotAt(10, 10) })
    expect(map.fitBounds).not.toHaveBeenCalled()
  })
})

describe('FollowRobot and the operator', () => {
  it('a drag on an interactive map asks to pause', () => {
    const onUserMove = vi.fn()
    render({ robot: robotAt(0, 0), onUserMove })
    act(() => { map.fire('dragstart') })
    expect(onUserMove).toHaveBeenCalledTimes(1)
  })

  it('a box zoom asks to pause', () => {
    const onUserMove = vi.fn()
    render({ robot: robotAt(0, 0), onUserMove })
    act(() => { map.fire('boxzoomend') })
    expect(onUserMove).toHaveBeenCalledTimes(1)
  })

  // The first version paused on `zoomend`, which setView and fitBounds fire
  // too -- so the site fit's own refit paused following for good.
  it('its own moves never ask to pause', () => {
    const onUserMove = vi.fn()
    render({ robot: robotAt(0, 0), onUserMove })
    act(() => { map.fire('zoomend'); map.fire('moveend') })
    expect(onUserMove).not.toHaveBeenCalled()
  })

  it('a map that cannot be dragged never asks', () => {
    const onUserMove = vi.fn()
    render({ robot: robotAt(0, 0), onUserMove, interactive: false })
    act(() => { map.fire('dragstart') })
    expect(onUserMove).not.toHaveBeenCalled()
  })

  it('while following, zoom gestures zoom about the robot; paused, about the pointer again', () => {
    render({ robot: robotAt(0, 0) })
    expect(map.options.scrollWheelZoom).toBe('center')
    expect(map.options.touchZoom).toBe('center')
    expect(map.options.doubleClickZoom).toBe('center')
    render({ robot: robotAt(0, 0), following: false })
    expect(map.options.scrollWheelZoom).toBe(true)
    expect(map.options.touchZoom).toBe(true)
    expect(map.options.doubleClickZoom).toBe(true)
  })

  it('leaves a disabled zoom gesture disabled', () => {
    map.options.scrollWheelZoom = false
    render({ robot: robotAt(0, 0) })
    expect(map.options.scrollWheelZoom).toBe(false)
  })

  it('stays on the robot after the operator zooms while following', () => {
    map.size = L.point(1600, 512)
    const r = robotAt(0, 0)
    // Visible x 400..1600: the focus is x = 1000, 200 px right of the centre.
    render({ robot: r, padding: { topLeft: [400, 0], bottomRight: [0, 0] } })
    expect(map.robotPx(r).x).toBeCloseTo(1000)
    // A 'center' zoom keeps the map centre, which is not the focus point when
    // a panel covers one side: one step in doubles the robot's 200 px offset,
    // out of the dead zone, and zoomend brings it back.
    act(() => { map.zoom += 1; map.fire('zoomend') })
    expect(map.robotPx(r).x).toBeCloseTo(1000)
  })

  it('lets go of its listeners when it unmounts', () => {
    render({ robot: robotAt(0, 0) })
    act(() => root.unmount())
    root = createRoot(host)
    expect(map.off).toHaveBeenCalledWith('dragstart', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('boxzoomend', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('zoomend', expect.any(Function))
    expect(map.options.scrollWheelZoom).toBe(true)
  })
})

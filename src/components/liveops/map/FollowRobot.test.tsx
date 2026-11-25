// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import L from 'leaflet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** One fake Leaflet map per test, shared with the component through useMap. */
let map: FakeMap

vi.mock('react-leaflet', () => ({ useMap: () => map }))

import { FOLLOW_DEAD_ZONE_FRACTION, FollowRobot, shouldPan } from './FollowRobot'
import type { RobotState } from '@/types'

type Handler = () => void

class FakeMap {
  panTo = vi.fn()
  setZoom = vi.fn()
  setView = vi.fn()
  fitBounds = vi.fn()
  getSize = vi.fn(() => L.point(400, 200))
  getCenter = vi.fn(() => ({ lat: 0, lng: 0 }))
  latLngToContainerPoint = vi.fn((ll: { lat: number; lng: number } | [number, number]) => {
    // 10 px per metre, centre of a 400 x 200 pane at map (0, 0).
    const [lat, lng] = Array.isArray(ll) ? ll : [ll.lat, ll.lng]
    return L.point(200 + lng * 10, 100 - lat * 10)
  })
  private handlers = new Map<string, Set<Handler>>()
  on = vi.fn((event: string, fn: Handler) => {
    const set = this.handlers.get(event) ?? new Set()
    set.add(fn)
    this.handlers.set(event, set)
  })
  off = vi.fn((event: string, fn: Handler) => { this.handlers.get(event)?.delete(fn) })
  fire(event: string) { for (const fn of [...(this.handlers.get(event) ?? [])]) fn() }
}

const robotAt = (x_m: number, y_m: number): RobotState =>
  ({ robot_id: 'r1', position: { x_m, y_m } } as RobotState)

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

function render(robot: RobotState, active: boolean, interactive: boolean) {
  act(() => { root.render(<FollowRobot robot={robot} active={active} interactive={interactive} />) })
}

describe('shouldPan', () => {
  const size = L.point(400, 200)
  const centre = L.point(200, 100)

  it('holds still while the robot is inside the dead zone', () => {
    // The zone is a radius of 0.2 * the SMALLER axis = 40 px.
    expect(shouldPan(L.point(210, 105), centre, size)).toBe(false)
    expect(shouldPan(L.point(230, 100), centre, size)).toBe(false)
  })

  it('pans once the robot leaves it', () => {
    expect(shouldPan(L.point(360, 100), centre, size)).toBe(true)
    expect(shouldPan(L.point(200, 10), centre, size)).toBe(true)
  })

  it('measures the zone against the smaller axis', () => {
    // A tall, narrow pane: 100 px wide, so the radius is 20 px, not 40.
    expect(shouldPan(L.point(80, 300), L.point(50, 300), L.point(100, 600))).toBe(true)
    expect(shouldPan(L.point(60, 300), L.point(50, 300), L.point(100, 600))).toBe(false)
  })

  it('uses FOLLOW_DEAD_ZONE_FRACTION by default', () => {
    const edge = L.point(200 + 200 * FOLLOW_DEAD_ZONE_FRACTION + 1, 100)
    expect(shouldPan(edge, centre, size)).toBe(true)
  })
})

describe('FollowRobot', () => {
  it('pans to the robot when it is active and the robot is off centre', () => {
    render(robotAt(30, 0), true, false)
    expect(map.panTo).toHaveBeenCalled()
    // CRS.Simple takes [y, x].
    expect(map.panTo.mock.calls[0]?.[0]).toEqual([0, 30])
  })

  it('does not pan while the robot sits near the centre', () => {
    render(robotAt(1, 1), true, false)
    expect(map.panTo).not.toHaveBeenCalled()
  })

  it('does not pan when it is not active', () => {
    render(robotAt(30, 0), false, false)
    expect(map.panTo).not.toHaveBeenCalled()
  })

  // Review Focus 3: a bridge sending a bad pose must not throw the view to
  // nowhere, which on a map with no bounds is unrecoverable by panning back.
  it('ignores a non-finite position', () => {
    render(robotAt(Number.NaN, 0), true, false)
    expect(map.panTo).not.toHaveBeenCalled()
    render(robotAt(0, Number.POSITIVE_INFINITY), true, false)
    expect(map.panTo).not.toHaveBeenCalled()
  })

  // Review Focus 4: the spec's first anti-goal. Being yanked back mid-look is
  // worse than a stale frame.
  it('stops following once the operator drags an interactive map', () => {
    render(robotAt(30, 0), true, true)
    map.panTo.mockClear()
    act(() => { map.fire('dragend') })
    render(robotAt(32, 0), true, true)
    expect(map.panTo).not.toHaveBeenCalled()
  })

  it('stops following once the operator zooms an interactive map', () => {
    render(robotAt(30, 0), true, true)
    map.panTo.mockClear()
    act(() => { map.fire('zoomend') })
    render(robotAt(32, 0), true, true)
    expect(map.panTo).not.toHaveBeenCalled()
  })

  it('keeps following a non-interactive map, which the operator cannot drag', () => {
    render(robotAt(30, 0), true, false)
    map.panTo.mockClear()
    act(() => { map.fire('dragend') })
    render(robotAt(32, 0), true, false)
    expect(map.panTo).toHaveBeenCalled()
  })

  it('never changes the zoom the operator chose', () => {
    render(robotAt(30, 0), true, true)
    render(robotAt(60, 20), true, true)
    expect(map.setZoom).not.toHaveBeenCalled()
    expect(map.setView).not.toHaveBeenCalled()
    expect(map.fitBounds).not.toHaveBeenCalled()
  })

  it('pans without animating, so a telemetry frame cannot queue up easing', () => {
    render(robotAt(30, 0), true, false)
    expect(map.panTo.mock.calls[0]?.[1]).toMatchObject({ animate: false })
  })

  it('lets go of its listeners when it unmounts', () => {
    render(robotAt(30, 0), true, true)
    act(() => root.unmount())
    root = createRoot(host)
    expect(map.off).toHaveBeenCalledWith('dragend', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('zoomend', expect.any(Function))
  })
})

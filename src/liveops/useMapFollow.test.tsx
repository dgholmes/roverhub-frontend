// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewKey } from '@/lib/viewMemory'
import { useMapFollow } from './useMapFollow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Follow = ReturnType<typeof useMapFollow>

let host: HTMLDivElement
let root: Root
let latest: Follow

function Probe({ robotId, siteId }: { robotId: string; siteId: string | null }) {
  latest = useMapFollow(robotId, siteId)
  return null
}

function render(robotId: string, siteId: string | null = 'site-a') {
  act(() => { root.render(<Probe robotId={robotId} siteId={siteId} />) })
}

const stored = (robotId: string, siteId = 'site-a') => {
  const raw = localStorage.getItem(viewKey('map', siteId, robotId))
  return raw == null ? null : JSON.parse(raw)
}
const store = (robotId: string, value: unknown, siteId = 'site-a') =>
  localStorage.setItem(viewKey('map', siteId, robotId), JSON.stringify(value))

beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('useMapFollow opening', () => {
  it('follows at the close-up with nothing remembered, as before', () => {
    render('r1')
    expect(latest).toMatchObject({ robotId: 'r1', following: true, restore: null })
  })

  it('follows at the remembered zoom', () => {
    store('r1', { following: true, zoom: 4.5 })
    render('r1')
    expect(latest).toMatchObject({ following: true, restore: { zoom: 4.5 } })
  })

  it('opens paused where the operator left it', () => {
    store('r1', { following: false, zoom: 3, centre: { x_m: 7, y_m: -2 } })
    render('r1')
    expect(latest).toMatchObject({ following: false, restore: { zoom: 3, centre: { x_m: 7, y_m: -2 } } })
  })

  it('reads the key for this site and robot only', () => {
    store('r1', { following: false, zoom: 3, centre: { x_m: 7, y_m: -2 } }, 'site-b')
    render('r1', 'site-a')
    expect(latest.following).toBe(true)
  })

  it('falls back to following for a bad value', () => {
    store('r1', { following: false, zoom: 3 })
    render('r1')
    expect(latest).toMatchObject({ following: true, restore: null })
  })

  it('falls back to following when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    render('r1')
    expect(latest).toMatchObject({ following: true, restore: null })
    expect(() => act(() => { latest.onView({ zoom: 3, centre: { x_m: 0, y_m: 0 } }); latest.pause() })).not.toThrow()
  })

  it('remembers nothing without a site: the inset', () => {
    store('r1', { following: false, zoom: 3, centre: { x_m: 7, y_m: -2 } })
    render('r1', null)
    expect(latest.following).toBe(true)
    act(() => { latest.onView({ zoom: 2, centre: { x_m: 1, y_m: 1 } }) })
    expect(stored('r1')).toEqual({ following: false, zoom: 3, centre: { x_m: 7, y_m: -2 } })
  })
})

describe('useMapFollow remembering', () => {
  it('remembers the zoom while following, and not the centre', () => {
    render('r1')
    act(() => { latest.onView({ zoom: 5.25, centre: { x_m: 4, y_m: 4 } }) })
    expect(stored('r1')).toEqual({ following: true, zoom: 5.25 })
  })

  it('remembers a pause with the last view, then the view the drag ends on', () => {
    render('r1')
    act(() => { latest.onView({ zoom: 5, centre: { x_m: 1, y_m: 2 } }) })
    act(() => { latest.pause() })
    expect(stored('r1')).toEqual({ following: false, zoom: 5, centre: { x_m: 1, y_m: 2 } })
    act(() => { latest.onView({ zoom: 5, centre: { x_m: 9, y_m: 2 } }) })
    expect(stored('r1')).toEqual({ following: false, zoom: 5, centre: { x_m: 9, y_m: 2 } })
  })

  it('a pause before any view was seen writes nothing yet', () => {
    render('r1')
    act(() => { latest.pause() })
    expect(stored('r1')).toBeNull()
  })

  it('remembers Follow robot at once, without a zoom: the close-up', () => {
    store('r1', { following: false, zoom: 3, centre: { x_m: 7, y_m: -2 } })
    render('r1')
    act(() => { latest.resume() })
    expect(latest).toMatchObject({ following: true, restore: null })
    expect(stored('r1')).toEqual({ following: true })
  })

  it('switching robots opens that robot\'s remembered view and writes under its key', () => {
    store('r2', { following: false, zoom: 2, centre: { x_m: 0, y_m: 5 } })
    render('r1')
    act(() => { latest.onView({ zoom: 6, centre: { x_m: 1, y_m: 1 } }) })
    render('r2')
    expect(latest).toMatchObject({ robotId: 'r2', following: false, restore: { zoom: 2, centre: { x_m: 0, y_m: 5 } } })
    // r1's last view is not r2's: a pause now has nothing of r2's to write.
    act(() => { latest.resume(); latest.pause() })
    expect(stored('r2')).toEqual({ following: true })
    expect(stored('r1')).toEqual({ following: true, zoom: 6 })
  })

  it('switching to a robot with nothing remembered follows it fresh', () => {
    store('r1', { following: false, zoom: 3, centre: { x_m: 7, y_m: -2 } })
    render('r1')
    render('r2')
    expect(latest).toMatchObject({ robotId: 'r2', following: true, restore: null })
  })
})

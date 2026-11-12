// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { SceneData } from '@/scene3d/types'
import type { SceneDataState } from '@/scene3d/useSceneData'
import {
  MAP_VIEW_KEY, MapViewSwitch, effectiveMapView, loadMapView, mapViewReasons, saveMapView, useMapViewPref,
  type MapView, type MapViewReasons,
} from './MapViewSwitch'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const withCloud = { cloud: { count: 10 } } as unknown as SceneData
const noCloud = { cloud: null } as unknown as SceneData
const ready = (data: SceneData): SceneDataState => ({ status: 'ready', data })

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  void i18n.changeLanguage('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('remembering the view', () => {
  it('reads back what was saved', () => {
    saveMapView('fly')
    expect(localStorage.getItem(MAP_VIEW_KEY)).toBe('fly')
    expect(loadMapView()).toBe('fly')
  })

  it('reads Plan for nothing saved, anything unknown, or storage that throws', () => {
    expect(loadMapView()).toBe('plan')
    localStorage.setItem(MAP_VIEW_KEY, 'orbit')
    expect(loadMapView()).toBe('plan')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadMapView()).toBe('plan')
  })

  it('never throws when storage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => saveMapView('3d')).not.toThrow()
  })

  it('the hook starts from the saved view and saves each choice', () => {
    saveMapView('follow')
    let pref: [MapView, (v: MapView) => void] | null = null
    function Probe() { pref = useMapViewPref(); return null }
    act(() => root.render(<Probe />))
    expect(pref![0]).toBe('follow')
    act(() => pref![1]('3d'))
    expect(pref![0]).toBe('3d')
    expect(localStorage.getItem(MAP_VIEW_KEY)).toBe('3d')
  })
})

describe('which views a floor allows', () => {
  it('none without a scene, and none while it loads', () => {
    expect(mapViewReasons(null)).toEqual({ '3d': 'viewNoScene', fly: 'viewNoScene', follow: 'viewNoScene' })
    expect(mapViewReasons({ status: 'loading', data: null })['3d']).toBe('viewLoading')
    expect(mapViewReasons({ status: 'idle', data: null }).fly).toBe('viewLoading')
    expect(mapViewReasons({ status: 'unavailable', data: null, reason: 'x' })['3d']).toBe('viewNoScene')
    expect(mapViewReasons({ status: 'error', data: null, reason: 'x' }).follow).toBe('viewNoScene')
  })

  it('3D only for a floor with no lidar cloud; all three with one', () => {
    expect(mapViewReasons(ready(noCloud))).toEqual({ '3d': null, fly: 'viewNoCloud', follow: 'viewNoCloud' })
    expect(mapViewReasons(ready(withCloud))).toEqual({ '3d': null, fly: null, follow: null })
  })

  it('answers the same object for the same answer, so the memoized switch skips frames', () => {
    expect(mapViewReasons(ready(withCloud))).toBe(mapViewReasons(ready(withCloud)))
    expect(mapViewReasons(null)).toBe(mapViewReasons(null))
  })

  it('shows the chosen view when it can be shown, else Plan', () => {
    const r = mapViewReasons(ready(noCloud))
    expect(effectiveMapView('3d', r)).toBe('3d')
    expect(effectiveMapView('fly', r)).toBe('plan')
    expect(effectiveMapView('plan', mapViewReasons(null))).toBe('plan')
    expect(effectiveMapView('follow', mapViewReasons(ready(withCloud)))).toBe('follow')
  })
})

describe('MapViewSwitch', () => {
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button[data-view]')]
  const draw = (value: MapView, reasons: MapViewReasons, onChange = vi.fn()) => {
    act(() => root.render(<MapViewSwitch value={value} onChange={onChange} reasons={reasons} />))
    return onChange
  }

  it('offers Plan, 3D, Fly and Follow, the chosen one pressed', () => {
    draw('fly', mapViewReasons(ready(withCloud)))
    expect(buttons().map((b) => b.textContent)).toEqual(['Plan', '3D', 'Fly', 'Follow'])
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
  })

  it('disables the scene views without scene data, saying why', () => {
    const onChange = draw('plan', mapViewReasons(null))
    const [plan, d3, fly, follow] = buttons()
    expect(plan.disabled).toBe(false)
    expect([d3, fly, follow].every((b) => b.disabled)).toBe(true)
    expect(d3.title).toBe('No 3D map for this floor')
    act(() => d3.click())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('without a cloud, 3D is offered and Fly and Follow say there is no scan', () => {
    draw('plan', mapViewReasons(ready(noCloud)))
    const [, d3, fly] = buttons()
    expect(d3.disabled).toBe(false)
    expect(fly.disabled).toBe(true)
    expect(fly.title).toBe('No lidar scan for this floor')
  })

  it('asks for the view clicked', () => {
    const onChange = draw('plan', mapViewReasons(ready(withCloud)))
    act(() => buttons()[3].click())
    expect(onChange).toHaveBeenCalledWith('follow')
  })
})

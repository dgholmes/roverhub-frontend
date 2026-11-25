// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SURVEY_LAYERS, SURVEY_LAYERS_KEY, loadSurveyLayers, saveSurveyLayers, useSurveyLayers, type SurveyLayerPrefs,
} from './mapLayerPrefs'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('the survey layer switches', () => {
  // The two survey layers answer questions an operator has on every run; the
  // two diagnostic ones answer a question asked once per map, so they stay out
  // of the way until asked for.
  it('default to the survey layers on and the diagnostic ones off', () => {
    const defaults = { walkable: true, lidar: true, unsurveyed: false, outliers: false }
    expect(DEFAULT_SURVEY_LAYERS).toEqual(defaults)
    expect(loadSurveyLayers()).toEqual(defaults)
  })

  it('come back as they were saved', () => {
    const a = { walkable: false, lidar: true, unsurveyed: true, outliers: false }
    saveSurveyLayers(a)
    expect(loadSurveyLayers()).toEqual(a)
    const b = { walkable: true, lidar: false, unsurveyed: false, outliers: true }
    saveSurveyLayers(b)
    expect(loadSurveyLayers()).toEqual(b)
  })

  it('read anything unreadable as that layer\'s own default', () => {
    for (const raw of ['not json', 'null', '7', '{"walkable":"no"}', '{}']) {
      localStorage.setItem(SURVEY_LAYERS_KEY, raw)
      expect(loadSurveyLayers(), raw)
        .toEqual({ walkable: true, lidar: true, unsurveyed: false, outliers: false })
    }
  })

  // A browser that remembered the two layers before these existed must not be
  // handed `undefined` for the new ones.
  it('fill in layers a browser remembered before they existed', () => {
    localStorage.setItem(SURVEY_LAYERS_KEY, JSON.stringify({ walkable: false, lidar: false }))
    expect(loadSurveyLayers())
      .toEqual({ walkable: false, lidar: false, unsurveyed: false, outliers: false })
  })

  it('survive a browser that refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadSurveyLayers())
      .toEqual({ walkable: true, lidar: true, unsurveyed: false, outliers: false })
    expect(() => saveSurveyLayers({
      walkable: false, lidar: false, unsurveyed: false, outliers: false,
    })).not.toThrow()
  })
})

describe('useSurveyLayers', () => {
  let host: HTMLDivElement
  let root: Root
  let state: SurveyLayerPrefs
  let toggle: (key: keyof SurveyLayerPrefs) => void
  function Probe() {
    ;[state, toggle] = useSurveyLayers()
    return null
  }
  const mount = () => {
    host = document.createElement('div')
    root = createRoot(host)
    act(() => root.render(<Probe />))
  }
  afterEach(() => act(() => root.unmount()))

  it('starts on, and a toggle is remembered by the next mount', () => {
    const off = { unsurveyed: false, outliers: false }
    mount()
    expect(state).toEqual({ walkable: true, lidar: true, ...off })
    act(() => toggle('lidar'))
    expect(state).toEqual({ walkable: true, lidar: false, ...off })
    act(() => root.unmount())
    mount()
    expect(state).toEqual({ walkable: true, lidar: false, ...off })
    act(() => toggle('walkable'))
    act(() => toggle('lidar'))
    expect(JSON.parse(localStorage.getItem(SURVEY_LAYERS_KEY)!))
      .toEqual({ walkable: false, lidar: true, ...off })
    // The diagnostic layers are remembered the same way, from off.
    act(() => toggle('unsurveyed'))
    expect(state).toEqual({ walkable: false, lidar: true, unsurveyed: true, outliers: false })
  })
})

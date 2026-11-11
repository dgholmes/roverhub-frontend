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
  it('default to both on', () => {
    expect(DEFAULT_SURVEY_LAYERS).toEqual({ walkable: true, lidar: true })
    expect(loadSurveyLayers()).toEqual({ walkable: true, lidar: true })
  })

  it('come back as they were saved', () => {
    saveSurveyLayers({ walkable: false, lidar: true })
    expect(loadSurveyLayers()).toEqual({ walkable: false, lidar: true })
    saveSurveyLayers({ walkable: true, lidar: false })
    expect(loadSurveyLayers()).toEqual({ walkable: true, lidar: false })
  })

  it('read anything unreadable as on', () => {
    for (const raw of ['not json', 'null', '7', '{"walkable":"no"}', '{}']) {
      localStorage.setItem(SURVEY_LAYERS_KEY, raw)
      expect(loadSurveyLayers(), raw).toEqual({ walkable: true, lidar: true })
    }
  })

  it('survive a browser that refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadSurveyLayers()).toEqual({ walkable: true, lidar: true })
    expect(() => saveSurveyLayers({ walkable: false, lidar: false })).not.toThrow()
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
    mount()
    expect(state).toEqual({ walkable: true, lidar: true })
    act(() => toggle('lidar'))
    expect(state).toEqual({ walkable: true, lidar: false })
    act(() => root.unmount())
    mount()
    expect(state).toEqual({ walkable: true, lidar: false })
    act(() => toggle('walkable'))
    act(() => toggle('lidar'))
    expect(JSON.parse(localStorage.getItem(SURVEY_LAYERS_KEY)!)).toEqual({ walkable: false, lidar: true })
  })
})

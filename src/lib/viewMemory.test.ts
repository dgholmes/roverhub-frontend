// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recall, remember, useRemembered, VIEW_MEMORY_PREFIX, viewKey } from './viewMemory'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const isString = (v: unknown): v is string => typeof v === 'string'

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('viewKey', () => {
  it('joins its parts under one prefix', () => {
    expect(viewKey('map', 'site-dev', 'rover-jetson')).toBe(`${VIEW_MEMORY_PREFIX}map.site-dev.rover-jetson`)
  })
})

describe('recall and remember', () => {
  it('reads back what was remembered', () => {
    remember('rh.view.x', { zoom: 3 })
    expect(recall('rh.view.x', (v): v is { zoom: number } => typeof (v as { zoom?: unknown })?.zoom === 'number'))
      .toEqual({ zoom: 3 })
  })

  it('is null for nothing stored', () => {
    expect(recall('rh.view.none', isString)).toBeNull()
  })

  it('is null for a value that fails validation, so an old shape falls back to the default', () => {
    localStorage.setItem('rh.view.x', JSON.stringify(42))
    expect(recall('rh.view.x', isString)).toBeNull()
  })

  it('is null for a value that is not JSON', () => {
    localStorage.setItem('rh.view.x', '{not json')
    expect(recall('rh.view.x', isString)).toBeNull()
  })

  it('survives storage that throws on read and on write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => remember('rh.view.x', 'a')).not.toThrow()
    expect(recall('rh.view.x', isString)).toBeNull()
  })
})

describe('useRemembered', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  let latest: [string, (v: string) => void] = ['', () => {}]
  function Probe({ storageKey }: { storageKey: string | null }) {
    latest = useRemembered(storageKey, 'front', (v): v is string => v === 'front' || v === 'back')
    return null
  }

  it('starts on the default, and on the remembered value once one is set', () => {
    act(() => root.render(<Probe storageKey="rh.view.cam.a" />))
    expect(latest[0]).toBe('front')
    act(() => latest[1]('back'))
    expect(latest[0]).toBe('back')
    act(() => root.unmount())
    root = createRoot(host)
    act(() => root.render(<Probe storageKey="rh.view.cam.a" />))
    expect(latest[0]).toBe('back')
  })

  it('reads the new key when the key changes', () => {
    remember('rh.view.cam.b', 'back')
    act(() => root.render(<Probe storageKey="rh.view.cam.a" />))
    expect(latest[0]).toBe('front')
    act(() => root.render(<Probe storageKey="rh.view.cam.b" />))
    expect(latest[0]).toBe('back')
  })

  it('with no key, holds the value in memory only', () => {
    act(() => root.render(<Probe storageKey={null} />))
    act(() => latest[1]('back'))
    expect(latest[0]).toBe('back')
    expect(localStorage.length).toBe(0)
  })
})

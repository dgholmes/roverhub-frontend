// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { MapVersion } from '@/types/mapPipeline'
import type { MapArtifactKind } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { grids } = vi.hoisted(() => ({ grids: { load: [] as { url: string; key: string }[] } }))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: {
    mapArtifactUrl: (mapId: string, floor: number, kind: MapArtifactKind) => `live/${mapId}/${floor}/${kind}`,
    mapVersionArtifactUrl: (mapId: string, version: number, floor: number, kind: MapArtifactKind) => `kept/${mapId}/${version}/${floor}/${kind}`,
  },
}))
// No grid comes back, so nothing is painted and the preview image is drawn:
// what is under test is which rows ask, and for which files.
vi.mock('@/missions/useFloorGrids', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/missions/useFloorGrids')>()),
  loadGrid: async (url: string, key: string) => { grids.load.push({ url, key }); return null },
}))

import { MapVersionsSection } from './MapVersionsSection'
import { versionFloorUrl, versionGridRequest } from './MapVersionThumbnail'

const FLOOR = {
  index: 0, size_cells: [400, 480] as [number, number], resolution_m: 0.05, origin_xy_m: [-5, -17] as [number, number],
  free_cells: 1, occupied_cells: 1, unknown_cells: 1, has_planning: false, has_track: false,
}
const v = (version: number, source: string, restored_from: number | null = null, over: Partial<MapVersion> = {}): MapVersion => ({
  version, current: version === 9, source, created_at: '2026-11-16T05:00:00Z', restored_from, detail: {}, name: 'Venue',
  updated_at: '2026-11-16T05:00:00Z', zones: 0, floors: [], quality: null, ...over,
})
const versions = [v(9, 'planning'), v(8, 'cloud_edit'), v(7, 'cloud_edits'), v(6, 'moved'), v(5, 'restore', 2),
  v(4, 'survey'), v(3, 'upload'), v(2, 'something_new')]
const html = () => renderToStaticMarkup(<MapVersionsSection versions={versions} error={null} canRestore={false} onRestore={async () => {}} />)

/** Seven versions of one map, as the provider hands them over: stamped with
 *  their map and carrying their floors. Version 7 is the live one. */
const SEVEN = [7, 6, 5, 4, 3, 2, 1].map((n) => v(n, 'survey', null, {
  map_id: 'map-1', current: n === 7, floors: [FLOOR], updated_at: `2026-11-2${n}T00:00:00Z`,
}))

/** An IntersectionObserver the test drives: `show(n)` brings version n's row on screen. */
class FakeObserver {
  static all: FakeObserver[] = []
  els: Element[] = []
  constructor(private cb: IntersectionObserverCallback) { FakeObserver.all.push(this) }
  observe(el: Element) { this.els.push(el) }
  unobserve() {}
  disconnect() { this.els = [] }
  takeRecords() { return [] }
}
const show = (version: number) => act(async () => {
  for (const io of [...FakeObserver.all]) {
    for (const el of io.els) {
      if ((el as HTMLElement).dataset.version === String(version)) {
        io['cb']([{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry], io as unknown as IntersectionObserver)
      }
    }
  }
  await Promise.resolve()
})

let host: HTMLDivElement
let root: Root
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const mount = async (list: MapVersion[] = SEVEN, extra: { canRestore?: boolean; onRestore?: (n: number) => Promise<void> } = {}) => {
  act(() => root.render(
    <MapVersionsSection versions={list} error={null} canRestore={extra.canRestore ?? false} onRestore={extra.onRestore ?? (async () => {})} />,
  ))
  await settle()
}
const row = (n: number) => host.querySelector<HTMLElement>(`li[data-version="${n}"]`)!
const buttonIn = (el: ParentNode, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === label)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  grids.load = []
  FakeObserver.all = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  void i18n.changeLanguage('en')
})

describe('where each version came from', () => {
  it('names every source the backend writes, in English and Korean', async () => {
    await i18n.changeLanguage('en')
    const en = html()
    for (const s of ['Brush edit', 'Map cleanup', 'Moved-spot list edited', 'Restored from version 2', 'Survey upload', 'Uploaded bundle']) {
      expect(en).toContain(s)
    }
    expect(en.match(/Map cleanup/g)).toHaveLength(2)
    expect(en).not.toMatch(/>planning<|>cloud_edit<|>moved</)
    await i18n.changeLanguage('ko')
    const ko = html()
    for (const s of ['브러시 편집', '지도 정리', '움직인 지점 목록 편집', '버전 2에서 복원', '측량 업로드', '번들 업로드']) expect(ko).toContain(s)
  })

  it('shows a source it does not know as it comes', async () => {
    await i18n.changeLanguage('en')
    expect(html()).toContain('something_new')
  })
})

describe("each version's files", () => {
  it('are the live map\'s for the current version and the archive\'s for a kept one', () => {
    const [current, kept] = [SEVEN[0], SEVEN[2]]
    expect(versionFloorUrl(current, 0, 'grid')).toBe('live/map-1/0/grid')
    expect(versionFloorUrl(kept, 0, 'preview')).toBe('kept/map-1/5/0/preview')
    // The current version shares the live map's grid cache key (gridRequests'); a kept one is keyed by its number.
    expect(versionGridRequest(current)).toEqual({ url: 'live/map-1/0/grid', key: 'map-1@2026-11-27T00:00:00Z/0' })
    expect(versionGridRequest(kept)).toEqual({ url: 'kept/map-1/5/0/grid', key: 'map-1@v5/0' })
  })

  it('are not asked for when the version does not say its map, or has no floor', () => {
    expect(versionGridRequest(v(3, 'upload', null, { floors: [FLOOR] }))).toBeNull()
    expect(versionGridRequest(v(3, 'upload', null, { map_id: 'map-1' }))).toBeNull()
  })
})

describe('the version thumbnails', () => {
  it('fetch a grid only for the rows on screen, once each', async () => {
    await mount()
    expect(host.querySelectorAll('li[data-version]')).toHaveLength(7)
    expect(grids.load).toEqual([])
    expect(host.querySelectorAll('[data-thumbnail="loading"]')).toHaveLength(7)
    expect(host.querySelector('image')).toBeNull()

    await show(7)
    await show(5)
    await settle()
    expect(grids.load.map((g) => g.url)).toEqual(['live/map-1/0/grid', 'kept/map-1/5/0/grid'])
    expect([...host.querySelectorAll<HTMLElement>('li[data-seen="true"]')].map((li) => li.dataset.version)).toEqual(['7', '5'])
    // With no grid to paint, the preview image of those two rows only.
    expect([...host.querySelectorAll('image')].map((i) => i.getAttribute('href'))).toEqual(['live/map-1/0/preview', 'kept/map-1/5/0/preview'])
    expect(row(6).querySelector('[data-thumbnail]')!.getAttribute('data-thumbnail')).toBe('loading')

    // A row that has loaded stays loaded; showing it again fetches nothing.
    await show(5)
    await settle()
    expect(grids.load).toHaveLength(2)
  })

  it('load every row where there is no IntersectionObserver to ask', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    await mount()
    expect(grids.load).toHaveLength(7)
  })

  it('draw nothing and fetch nothing for a version without files (mock mode)', async () => {
    await mount([v(2, 'survey', null, { current: true, floors: [FLOOR] }), v(1, 'upload')])
    await show(2)
    await show(1)
    await settle()
    expect(grids.load).toEqual([])
    expect([...host.querySelectorAll('[data-thumbnail]')].map((t) => t.getAttribute('data-thumbnail'))).toEqual(['none', 'none'])
    expect(host.textContent).toContain('No floor plan')
  })

  it('open larger when pressed, and close on Escape with focus back on the thumbnail', async () => {
    await mount()
    await show(5)
    const thumb = row(5).querySelector<HTMLButtonElement>('button[aria-label="Show version 5 larger"]')!
    thumb.focus()
    await act(async () => thumb.click())
    await settle()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Floor plan of version 5')
    expect(dialog.querySelector('[data-thumbnail]')).not.toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close')
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(thumb)
  })
})

describe('the current version', () => {
  it('is the one row marked current, and has nothing to restore', async () => {
    await mount(SEVEN, { canRestore: true })
    const current = [...host.querySelectorAll<HTMLElement>('li[aria-current="true"]')]
    expect(current.map((li) => li.dataset.version)).toEqual(['7'])
    expect(current[0].textContent).toContain('Current')
    expect(buttonIn(current[0], 'Restore')).toBeUndefined()
    expect(host.textContent!.match(/Current/g)).toHaveLength(1)
    for (const n of [6, 5, 4, 3, 2, 1]) expect(buttonIn(row(n), 'Restore')).toBeDefined()
  })
})

describe('Restore', () => {
  it('asks first, then restores the version it was asked for', async () => {
    const onRestore = vi.fn(async () => {})
    await mount(SEVEN, { canRestore: true, onRestore })
    await act(async () => buttonIn(row(5), 'Restore')!.click())
    const alert = row(5).querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('Restore version 5? It becomes the current version again')
    expect(buttonIn(row(5), 'Restore')).toBeUndefined()
    await act(async () => buttonIn(row(5), 'Restore version 5')!.click())
    await settle()
    expect(onRestore).toHaveBeenCalledWith(5)
    expect(row(5).querySelector('[role="alert"]')).toBeNull()
  })

  it('can be cancelled, and says why it failed', async () => {
    const onRestore = vi.fn(async () => { throw new Error('409 conflict') })
    await mount(SEVEN, { canRestore: true, onRestore })
    await act(async () => buttonIn(row(4), 'Restore')!.click())
    await act(async () => buttonIn(row(4), 'Cancel')!.click())
    expect(row(4).querySelector('[role="alert"]')).toBeNull()
    expect(onRestore).not.toHaveBeenCalled()
    await act(async () => buttonIn(row(4), 'Restore')!.click())
    await act(async () => buttonIn(row(4), 'Restore version 4')!.click())
    await settle()
    expect(row(4).textContent).toContain('Could not restore: 409 conflict')
  })

  it('is not offered without the right to configure', async () => {
    await mount(SEVEN, { canRestore: false })
    expect(buttonIn(host, 'Restore')).toBeUndefined()
  })
})

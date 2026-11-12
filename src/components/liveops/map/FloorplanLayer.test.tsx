// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import type { SiteMap } from '@/types/maps'
import { mockMaps } from '@/mocks/maps'

// An ImageOverlay needs a live Leaflet map, which a test does not have. Stand
// it in with an <img> carrying the props that matter.
vi.mock('react-leaflet', () => ({
  ImageOverlay: (p: { url: string; bounds: unknown; opacity?: number; zIndex?: number; eventHandlers?: unknown }) => (
    <img
      data-testid="overlay" src={p.url} data-bounds={JSON.stringify(p.bounds)} data-opacity={p.opacity} data-z={p.zIndex}
      data-pixelated={p.eventHandlers ? 'yes' : 'no'}
    />
  ),
}))

const provider = vi.hoisted(() => ({ artifactUrl: '' }))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { mapArtifactUrl: () => provider.artifactUrl },
}))

// The scene's loader and painter are tested where they live; here they are
// inputs. `scene.state` is what useSceneData answers; paintFloor only records.
const scene = vi.hoisted(() => ({ state: { status: 'loading', data: null } as { status: string; data: unknown } }))
vi.mock('@/scene3d/useSceneData', () => ({ useSceneData: () => scene.state }))
const paint = vi.hoisted(() => ({ paintFloor: vi.fn((_g: unknown, _p: unknown, canvas?: unknown) => canvas) }))
vi.mock('@/scene3d/paintFloor', () => ({ paintFloor: paint.paintFloor }))

import { FloorplanLayer, PIXELATED, formatAreaM2, sceneGridBounds } from './FloorplanLayer'
import type { SceneData, SceneGrid } from '@/scene3d/types'
import type { WalkableStatus } from '@/liveops/useWalkableArea'
import type { WalkableAnalysis } from '@/liveops/walkable'
import { FloorPicker } from './FloorPicker'
import { boundsForFloor } from '@/liveops/mapFloor'

const venue = mockMaps[0]
const floor = venue.floors[0]

/** A floor that is mostly surveyed, so no warning is due. */
const wellSurveyed: SiteMap = {
  ...venue,
  floors: [{ ...floor, free_cells: 100000, occupied_cells: 20000, unknown_cells: 72000 }],
}

const twoFloors: SiteMap = {
  ...venue,
  floors: [floor, { ...floor, index: 1, label: 'Mezzanine', floor_z_m: 3.1 }],
}

beforeEach(() => {
  provider.artifactUrl = 'http://api.test/maps/map-venue-survey/floors/0/preview'
  scene.state = { status: 'loading', data: null }
})

describe('boundsForFloor', () => {
  it('places the overlay at the floor origin in metres, as [y, x] corners', () => {
    expect(boundsForFloor(floor)).toEqual([[-17.8671, -5.4753], [6.1329, 14.5247]])
  })
})

describe('FloorplanLayer', () => {
  it('draws the preview image at the floor bounds, translucent and under the vectors', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={wellSurveyed} floorIndex={0} />)
    expect(html).toContain('src="http://api.test/maps/map-venue-survey/floors/0/preview"')
    expect(html).toContain('data-bounds="[[-17.8671,-5.4753],[6.1329,14.5247]]"')
    expect(html).toContain('data-opacity="0.85"')
    expect(html).toMatch(/data-z="-\d+"/)
  })

  it('renders nothing when the map has no floors', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={{ ...venue, floors: [] }} floorIndex={0} />)
    expect(html).toBe('')
  })

  it('renders nothing for a floor index the map does not have', () => {
    expect(renderToStaticMarkup(<FloorplanLayer map={venue} floorIndex={7} />)).toBe('')
  })

  it('draws no image when there is no artifact URL, as in mock mode', () => {
    provider.artifactUrl = ''
    const html = renderToStaticMarkup(<FloorplanLayer map={wellSurveyed} floorIndex={0} />)
    expect(html).not.toContain('<img')
  })

  it('warns when a floor is mostly unsurveyed, rounding down rather than flattering it', () => {
    // 13.9% surveyed in the mock: stated as 13%, never 14%.
    const html = renderToStaticMarkup(<FloorplanLayer map={venue} floorIndex={0} />)
    expect(html).toMatch(/13% surveyed/i)
    expect(html).not.toMatch(/14% surveyed/i)
  })

  it('still warns when the image is absent, since the caption describes the data', () => {
    provider.artifactUrl = ''
    expect(renderToStaticMarkup(<FloorplanLayer map={venue} floorIndex={0} />)).toMatch(/13% surveyed/i)
  })

  it('stays quiet about a well-surveyed floor', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={wellSurveyed} floorIndex={0} />)
    expect(html).not.toMatch(/surveyed/i)
  })

  it('finds the floor by its index, not its position in the list', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={{ ...twoFloors, floors: [twoFloors.floors[1]] }} floorIndex={1} />)
    expect(html).toContain('<img')
  })
})

describe('FloorplanLayer with a planning grid (schema 0.0.17)', () => {
  const [w, h] = floor.size_cells
  const planned: SiteMap = {
    ...venue,
    floors: [{ ...floor, planning: { free_cells: 1000, occupied_cells: 2000, unknown_cells: w * h - 3000, clearance_m: 0.2 } }],
  }
  // 41,234 walkable 5 cm cells is 103.085 m².
  const ready: WalkableStatus = {
    state: 'ready',
    analysis: { walkableCells: 41234, resolution_m: 0.05 } as WalkableAnalysis,
  }

  it('says how much of the floor the robot can walk instead of how much was surveyed', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={planned} floorIndex={0} walkable={ready} />)
    expect(html).toContain('Walkable area: 103 m²')
    expect(html).not.toMatch(/surveyed/i)
  })

  it('says nothing in that corner while the planning grid loads', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={planned} floorIndex={0} walkable={{ state: 'loading' }} />)
    expect(html).not.toMatch(/surveyed|Walkable area/i)
  })

  it('falls back to the survey caption when the planning grid cannot be read', () => {
    const html = renderToStaticMarkup(<FloorplanLayer map={planned} floorIndex={0} walkable={{ state: 'failed' }} />)
    expect(html).toMatch(/13% surveyed/i)
  })

  it('keeps the survey caption on a floor with no planning grid', () => {
    expect(renderToStaticMarkup(<FloorplanLayer map={venue} floorIndex={0} walkable={ready} />)).toMatch(/13% surveyed/i)
  })

  it('puts the floorplan image under the walkable tint', () => {
    expect(renderToStaticMarkup(<FloorplanLayer map={planned} floorIndex={0} walkable={ready} />)).toContain('data-z="-2"')
  })

  it('shows a small area to one decimal', () => {
    expect(formatAreaM2(9.44)).toBe('9.4')
    expect(formatAreaM2(103.085)).toBe('103')
  })
})

describe('FloorplanLayer painting the floor in the scene colours', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  /** The venue floor as a scene grid: same origin, size and resolution. */
  const grid: SceneGrid = {
    w: floor.size_cells[0], h: floor.size_cells[1], res: floor.resolution_m,
    origin: [floor.origin_xy_m[0], floor.origin_xy_m[1]],
    bits: new Uint8Array(floor.size_cells[0] * floor.size_cells[1]),
    content: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  }
  const ready = (): { status: string; data: SceneData } => ({
    status: 'ready',
    data: { mapId: venue.map_id, floorIndex: 0, floorZ: 0, grid, cloud: null, hasPlanning: true },
  })

  let host: HTMLDivElement
  let root: Root
  let urls = 0
  let context: object | null = {}
  const created: string[] = []
  const revoked: string[] = []

  beforeEach(() => {
    urls = 0
    context = {}
    created.length = 0
    revoked.length = 0
    paint.paintFloor.mockClear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => {
      queueMicrotask(() => cb(new Blob(['png'])))
    })
    URL.createObjectURL = vi.fn(() => { const u = `blob:floor-${++urls}`; created.push(u); return u })
    URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u) })
    document.documentElement.setAttribute('data-theme', 'dark')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.documentElement.removeAttribute('data-theme')
    vi.restoreAllMocks()
  })

  /** Let the paint's blob callback, any theme observer and React's update land. */
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  const overlays = () => [...host.querySelectorAll<HTMLImageElement>('[data-testid="overlay"]')]

  it('draws the painted grid, opaque and pixelated, over the floor bounds instead of the preview', async () => {
    scene.state = ready()
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()

    const [img, ...rest] = overlays()
    expect(rest).toHaveLength(0)
    expect(img.getAttribute('src')).toBe('blob:floor-1')
    expect(img.dataset.opacity).toBe('1')
    expect(img.dataset.z).toBe('-2')
    expect(img.dataset.pixelated).toBe('yes')
    const bounds = (JSON.parse(img.dataset.bounds!) as number[][]).flat()
    boundsForFloor(floor).flat().forEach((v, i) => expect(bounds[i]).toBeCloseTo(v as number, 6))
    expect(paint.paintFloor).toHaveBeenCalledTimes(1)
    expect(paint.paintFloor.mock.calls[0][0]).toBe(grid)
    // The palette is resolved from the theme, every scene colour present.
    expect(paint.paintFloor.mock.calls[0][1]).toMatchObject({ bg: expect.any(String), wall: expect.any(String), furn: expect.any(String) })
  })

  it.each(['loading', 'unavailable', 'error'])('keeps the translucent preview while the scene is %s', async (status) => {
    scene.state = { status, data: null }
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()

    const [img, ...rest] = overlays()
    expect(rest).toHaveLength(0)
    expect(img.getAttribute('src')).toBe(provider.artifactUrl)
    expect(img.dataset.opacity).toBe('0.85')
    expect(img.dataset.pixelated).toBe('no')
    expect(paint.paintFloor).not.toHaveBeenCalled()
  })

  it('keeps the preview when there is no 2D canvas to paint into', async () => {
    context = null
    scene.state = ready()
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()
    expect(overlays().map((i) => i.getAttribute('src'))).toEqual([provider.artifactUrl])
  })

  it('paints once, keeping one URL, however often the map re-renders', async () => {
    scene.state = ready()
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()
    // A fresh `walkable` object gets past memo, as a telemetry-driven parent can.
    for (let i = 0; i < 5; i++) {
      act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} walkable={{ state: 'loading' }} />))
      await settle()
    }
    expect(paint.paintFloor).toHaveBeenCalledTimes(1)
    expect(created).toEqual(['blob:floor-1'])
    expect(overlays().map((i) => i.getAttribute('src'))).toEqual(['blob:floor-1'])
  })

  it('repaints when the theme changes, and lets go of the old image', async () => {
    scene.state = ready()
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()

    document.documentElement.setAttribute('data-theme', 'light')
    await settle()
    await settle()

    expect(paint.paintFloor).toHaveBeenCalledTimes(2)
    expect(overlays().map((i) => i.getAttribute('src'))).toEqual(['blob:floor-2'])
    expect(revoked).toEqual(['blob:floor-1'])
  })

  it('does not repaint for an unrelated attribute on <html>', async () => {
    scene.state = ready()
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()
    document.documentElement.setAttribute('lang', 'ko')
    await settle()
    document.documentElement.removeAttribute('lang')
    expect(paint.paintFloor).toHaveBeenCalledTimes(1)
  })

  it('revokes its image when it unmounts', async () => {
    scene.state = ready()
    act(() => root.render(<FloorplanLayer map={wellSurveyed} floorIndex={0} />))
    await settle()
    act(() => root.render(<></>))
    expect(revoked).toEqual(['blob:floor-1'])
  })

  it('sizes the painted overlay from the grid itself', () => {
    expect(sceneGridBounds({ ...grid, w: 4, h: 2, res: 0.5, origin: [-1, 3] })).toEqual([[3, -1], [4, 1]])
  })

  it('makes the painted image pixelated once Leaflet has its element', () => {
    const el = document.createElement('img')
    ;(PIXELATED.add as (e: unknown) => void)({ target: { getElement: () => el } })
    expect(el.style.imageRendering).toBe('pixelated')
  })
})

describe('FloorPicker', () => {
  it('shows one entry per floor and marks the active one', () => {
    const html = renderToStaticMarkup(<FloorPicker map={twoFloors} value={1} onChange={() => {}} />)
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('Mezzanine')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Mezzanine|Mezzanine.*aria-pressed="true"/)
  })

  it('names an unlabelled floor by its number', () => {
    const html = renderToStaticMarkup(<FloorPicker map={twoFloors} value={0} onChange={() => {}} />)
    expect(html).toMatch(/Floor 0/)
  })

  it('draws no outlines', () => {
    const html = renderToStaticMarkup(<FloorPicker map={twoFloors} value={0} onChange={() => {}} />)
    expect(html).not.toMatch(/border:\s*\d+px solid/)
  })

  it('renders nothing for a map with no floors', () => {
    expect(renderToStaticMarkup(<FloorPicker map={{ ...venue, floors: [] }} value={0} onChange={() => {}} />)).toBe('')
  })
})

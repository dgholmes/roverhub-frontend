// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { mockMaps } from '@/mocks/maps'
import type { GridPixels } from '@/missions/floorCells'
import type { MapArtifactKind, SiteMap } from '@/types/maps'
import type { RobotState } from '@/types'
import type { LatLngBoundsLiteral } from 'leaflet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { urls, grids } = vi.hoisted(() => ({
  /** What the provider serves per artifact kind; '' is "no stored file". */
  urls: { grid: '', preview: '' } as Record<string, string>,
  grids: { next: null as GridPixels | null, load: [] as string[] },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: {
    mapArtifactUrl: (mapId: string, floor: number, kind: MapArtifactKind) => (urls[kind] ? `${urls[kind]}/${mapId}/${floor}` : ''),
  },
}))
vi.mock('@/missions/useFloorGrids', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/missions/useFloorGrids')>()),
  loadGrid: async (url: string) => { grids.load.push(url); return grids.next },
}))
// The real painter needs a canvas jsdom does not have; its cropping and
// bounds are what is under test, so only the pixel work is stubbed.
vi.mock('@/scene3d/paintFloor', () => ({ paintFloor: () => {} }))

import { SiteMapThumbnail, robotsOnFloor } from './SiteMapThumbnail'
import { cropBounds, cropCells } from '@/components/liveops/map/useFloorCanvas'
import { contentBoundsM } from '@/liveops/contentBounds'
import { buildSceneGrid } from '@/scene3d/sceneData'

const VENUE = mockMaps[0]
const FLOOR = VENUE.floors[0]

/** A 400 x 480 grid (the venue's size), unknown except an occupied block in
 * its right-hand quarter: the building as a patch against one edge. */
function patchGrid(): GridPixels {
  const [w, h] = FLOOR.size_cells
  const pixels = new Uint8Array(w * h).fill(205)
  for (let row = 100; row < 300; row++) for (let col = 300; col < 380; col++) pixels[row * w + col] = 0
  return { width: w, height: h, pixels }
}
const sceneGridOf = (px: GridPixels) => buildSceneGrid(px, null, FLOOR.resolution_m, [FLOOR.origin_xy_m[0], FLOOR.origin_xy_m[1]])
const viewBoxOfBounds = (b: LatLngBoundsLiteral) => `${b[0][1]} ${-b[1][0]} ${b[1][1] - b[0][1]} ${b[1][0] - b[0][0]}`

const robot = (id: string, x: number, y: number, mapId: string | null = VENUE.map_id): RobotState => ({
  ...initialRobots[0], robot_id: id, name: id,
  position: { ...initialRobots[0].position, x_m: x, y_m: y },
  bridge: { ...initialRobots[0].bridge!, nav_map_id: mapId },
})

let host: HTMLDivElement
let root: Root
const created: string[] = []
const revoked: string[] = []
let canvasWorks = true
const thumb = () => document.querySelector('[data-thumbnail]')!
const kind = () => thumb().getAttribute('data-thumbnail')
const viewBox = () => document.querySelector('svg')?.getAttribute('viewBox')
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })
const render = async (map: SiteMap | null, robots: RobotState[] = [], extra: { loading?: boolean; error?: boolean } = {}) => {
  act(() => root.render(<SiteMapThumbnail map={map} robots={robots} {...extra} />))
  await settle()
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
  HTMLCanvasElement.prototype.getContext = function () {
    return canvasWorks ? ({ drawImage: () => {}, imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D) : null
  } as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'])) }
  let n = 0
  URL.createObjectURL = () => { const u = `blob:floor-${++n}`; created.push(u); return u }
  URL.revokeObjectURL = (u: string) => { revoked.push(u) }
})
beforeEach(() => {
  urls.grid = ''
  urls.preview = ''
  grids.next = null
  grids.load = []
  created.length = 0
  revoked.length = 0
  canvasWorks = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('SiteMapThumbnail', () => {
  it('says there is no map, or that maps are loading or unreachable', async () => {
    await render(null)
    expect(kind()).toBe('none')
    expect(thumb().textContent).toContain('No map yet')
    await render(null, [], { loading: true })
    expect(kind()).toBe('loading')
    await render(null, [], { error: true })
    expect(kind()).toBe('error')
  })

  it('paints the floor grid cropped to the surveyed content, not the whole grid', async () => {
    urls.grid = 'http://api/grid'
    urls.preview = 'http://api/preview'
    grids.next = patchGrid()
    await render(VENUE)
    expect(grids.load).toEqual([`http://api/grid/${VENUE.map_id}/0`])
    expect(kind()).toBe('painted')
    const grid = sceneGridOf(grids.next)
    const crop = cropBounds(grid, cropCells(grid))
    expect(viewBox()).toBe(viewBoxOfBounds(crop))
    // Much narrower than the 20 m grid: the content is 4 m wide.
    const width = Number(viewBox()!.split(' ')[2])
    expect(width).toBeLessThan(6)
    // The painted image, not the preview, fills exactly the crop.
    const image = document.querySelector('image')!
    expect(image.getAttribute('href')).toBe(created[0])
    expect(Number(image.getAttribute('width'))).toBeCloseTo(width)
  })

  it('keeps robot dots in the same map-metre frame', async () => {
    urls.grid = 'http://api/grid'
    grids.next = patchGrid()
    const [x0, y0] = FLOOR.origin_xy_m
    const here = robot('here', x0 + 17, y0 + 12)
    await render(VENUE, [here])
    const dot = document.querySelector('[data-robot-dot="here"]')!
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(x0 + 17)
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(-(y0 + 12)) // y flipped: north up
  })

  it('revokes the painted URL when the map changes and on unmount', async () => {
    urls.grid = 'http://api/grid'
    grids.next = patchGrid()
    await render(VENUE)
    expect(created).toHaveLength(1)
    await render({ ...VENUE, updated_at: '2026-11-27T00:00:00Z' })
    expect(created).toHaveLength(2)
    expect(revoked).toEqual([created[0]])
    act(() => root.unmount())
    expect(revoked).toEqual([created[0], created[1]])
    root = createRoot(host)
  })

  it('falls back to the preview, framed on the content, when the grid cannot be painted', async () => {
    urls.grid = 'http://api/grid'
    urls.preview = 'http://api/preview'
    grids.next = patchGrid()
    canvasWorks = false
    await render(VENUE)
    expect(kind()).toBe('image')
    expect(document.querySelector('image')!.getAttribute('href')).toBe(`http://api/preview/${VENUE.map_id}/0`)
    expect(viewBox()).toBe(viewBoxOfBounds(contentBoundsM(sceneGridOf(grids.next))))
  })

  it('falls back to the whole-grid preview when the grid cannot be read', async () => {
    urls.grid = 'http://api/grid'
    urls.preview = 'http://api/preview'
    grids.next = null
    await render(VENUE)
    expect(kind()).toBe('image')
    const [x0, y0] = FLOOR.origin_xy_m
    expect(viewBox()!.split(' ').map(Number)[0]).toBeCloseTo(x0)
    expect(viewBox()!.split(' ').map(Number)[1]).toBeCloseTo(-(y0 + FLOOR.size_cells[1] * FLOOR.resolution_m))
  })

  it('draws the floor outline when there is neither a grid nor an image (mock mode)', async () => {
    await render(VENUE)
    expect(kind()).toBe('sketch')
    expect(document.querySelector('image')).toBeNull()
    expect(grids.load).toEqual([])
  })

  it('robotsOnFloor: a dot only for a robot on this map standing on the floor', () => {
    const [x0, y0] = FLOOR.origin_xy_m
    const here = robot('here', x0 + 1, y0 + 1)
    const offFloor = robot('off-floor', x0 - 50, y0)
    const otherMap = robot('other-map', x0 + 1, y0 + 1, 'map-car-park')
    const noMap = robot('no-map', x0 + 1, y0 + 1, null)
    expect(robotsOnFloor([here, offFloor, otherMap, noMap], VENUE, FLOOR).map((r) => r.robot_id)).toEqual(['here'])
  })
})

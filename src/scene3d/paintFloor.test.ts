// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SCENE_PALETTE_DARK } from './palette'
import { cellColour, isDarkPalette, mixRgb, paintFloor, parseColour } from './paintFloor'
import { GRID_FURNITURE, GRID_KNOWN, GRID_WALKABLE, GRID_WALL, type SceneGrid, type ScenePalette } from './types'

const dark = SCENE_PALETTE_DARK as ScenePalette
const light: ScenePalette = { ...dark, bg: '#e6e6eb', floor: '#fbfbfd', wall: '#3a3a3e', furn: '#c4c4ca' }
const rgba = (hex: string) => [...parseColour(hex)!, 255]

describe('parseColour and mixRgb', () => {
  it('reads hex and rgb() forms', () => {
    expect(parseColour('#0a84ff')).toEqual([10, 132, 255])
    expect(parseColour(' #FFF ')).toEqual([255, 255, 255])
    expect(parseColour('#0a84ff80')).toEqual([10, 132, 255])
    expect(parseColour('rgb(1, 2, 3)')).toEqual([1, 2, 3])
    expect(parseColour('rgba(10 20 30 / 0.5)')).toEqual([10, 20, 30])
    expect(parseColour('tomato')).toBeNull()
  })

  it('mixes toward the second colour', () => {
    expect(mixRgb([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25])
    expect(mixRgb([10, 10, 10], [20, 20, 20], 0)).toEqual([10, 10, 10])
  })

  it('tells the dark palette from the light one', () => {
    expect(isDarkPalette(dark)).toBe(true)
    expect(isDarkPalette(light)).toBe(false)
  })
})

describe('cellColour', () => {
  const floor = parseColour(dark.floor)!, accent = parseColour(dark.accent)!

  it('paints walls, furniture, known floor, and leaves unknown transparent', () => {
    expect(cellColour(GRID_WALL | GRID_KNOWN, false, dark)).toEqual(rgba(dark.wall))
    expect(cellColour(GRID_FURNITURE | GRID_KNOWN, false, dark)).toEqual(rgba(dark.furn))
    expect(cellColour(GRID_KNOWN, false, dark)).toEqual(rgba(dark.floor))
    expect(cellColour(0, false, dark)).toEqual([0, 0, 0, 0])
  })

  it('wall wins over every other bit, then furniture over walkable', () => {
    expect(cellColour(GRID_WALL | GRID_FURNITURE | GRID_WALKABLE | GRID_KNOWN, true, dark)).toEqual(rgba(dark.wall))
    expect(cellColour(GRID_FURNITURE | GRID_WALKABLE, true, dark)).toEqual(rgba(dark.furn))
  })

  it('tints walkable toward the accent, more strongly on an edge, less on light', () => {
    expect(cellColour(GRID_WALKABLE | GRID_KNOWN, false, dark)).toEqual([...mixRgb(floor, accent, 0.22), 255])
    expect(cellColour(GRID_WALKABLE | GRID_KNOWN, true, dark)).toEqual([...mixRgb(floor, accent, 0.8), 255])
    const lightFloor = parseColour(light.floor)!
    expect(cellColour(GRID_WALKABLE, false, light)).toEqual([...mixRgb(lightFloor, accent, 0.16), 255])
    expect(cellColour(GRID_WALKABLE, true, light)).toEqual([...mixRgb(lightFloor, accent, 0.75), 255])
  })

  it('paints hidden layers as floor', () => {
    const off = { showWalkable: false, showFurniture: false }
    expect(cellColour(GRID_WALKABLE | GRID_KNOWN, true, dark, off)).toEqual(rgba(dark.floor))
    expect(cellColour(GRID_FURNITURE | GRID_KNOWN, false, dark, off)).toEqual(rgba(dark.floor))
  })

  it('falls back to the dark value for a colour it cannot read', () => {
    expect(cellColour(GRID_WALL, false, { ...dark, wall: 'var(--x)' })).toEqual(rgba(dark.wall))
  })
})

/** A canvas whose 2D context only records the ImageData put into it. */
function fakeCanvas() {
  const put: { data: Uint8ClampedArray; width: number; height: number }[] = []
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (img: { data: Uint8ClampedArray; width: number; height: number }) => { put.push(img) },
  }
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
  return { canvas, put }
}

const gridOf = (w: number, h: number, bits: number[]): SceneGrid => ({
  w, h, res: 1, origin: [0, 0], bits: new Uint8Array(bits), content: { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 },
})

describe('paintFloor', () => {
  it('paints north up: cell (i, j) lands on pixel (i, h - 1 - j)', () => {
    const { canvas, put } = fakeCanvas()
    // Row 0 (lowest y) is a wall then unknown; row 1 is known floor then furniture.
    const grid = gridOf(2, 2, [GRID_WALL, 0, GRID_KNOWN, GRID_FURNITURE])
    expect(paintFloor(grid, dark, canvas)).toBe(canvas)
    expect([canvas.width, canvas.height]).toEqual([2, 2])
    const px = Array.from(put[0].data)
    expect(px.slice(0, 4)).toEqual(rgba(dark.floor)) // top-left: cell (0, 1)
    expect(px.slice(4, 8)).toEqual(rgba(dark.furn)) // top-right: cell (1, 1)
    expect(px.slice(8, 12)).toEqual(rgba(dark.wall)) // bottom-left: cell (0, 0)
    expect(px[15]).toBe(0) // bottom-right: unknown
  })

  it('marks walkable cells with a non-walkable neighbour, or on the border, as edge', () => {
    const { canvas, put } = fakeCanvas()
    const W = GRID_WALKABLE | GRID_KNOWN
    const grid = gridOf(5, 5, Array(25).fill(W))
    paintFloor(grid, dark, canvas)
    const px = put[0].data
    const at = (i: number, j: number) => Array.from(px.slice(((4 - j) * 5 + i) * 4, ((4 - j) * 5 + i) * 4 + 4))
    expect(at(2, 2)).toEqual(cellColour(W, false, dark))
    expect(at(1, 1)).toEqual(cellColour(W, false, dark))
    expect(at(0, 2)).toEqual(cellColour(W, true, dark))
    expect(at(2, 4)).toEqual(cellColour(W, true, dark))
  })

  it('returns the canvas sized but unpainted when there is no 2D context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // jsdom reports getContext as not implemented
    const canvas = paintFloor(gridOf(3, 2, [0, 0, 0, 0, 0, 0]), dark)
    expect([canvas.width, canvas.height]).toEqual([3, 2])
  })

  it('paints a 1020 x 880 floor quickly', () => {
    const w = 1020, h = 880
    const bits = new Uint8Array(w * h)
    for (let k = 0; k < bits.length; k++) bits[k] = [0, GRID_KNOWN, GRID_WALKABLE | GRID_KNOWN, GRID_WALL, GRID_FURNITURE][k % 5]
    const { canvas } = fakeCanvas()
    const grid = { ...gridOf(w, h, []), bits }
    paintFloor(grid, dark, canvas) // warm up
    const t0 = performance.now()
    paintFloor(grid, dark, canvas)
    // Generous for a loaded CI machine; locally it is a few milliseconds.
    expect(performance.now() - t0).toBeLessThan(200)
  })
})

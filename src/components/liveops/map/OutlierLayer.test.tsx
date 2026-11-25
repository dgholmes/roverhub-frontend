// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Leaflet wants a real map. Record what the layer asks it to draw instead.
const leaflet = vi.hoisted(() => {
  const markers: { at: [number, number]; opts: Record<string, unknown> }[] = []
  const panes = new Map<string, { style: Record<string, string> }>()
  const state = { markers, panes, groupCleared: 0, groupRemoved: 0, rendererRemoved: 0 }
  return {
    state,
    default: {
      canvas: (o: unknown) => ({ _canvas: o, remove: () => { state.rendererRemoved++ } }),
      layerGroup: () => {
        const group = {
          addTo: () => group,
          clearLayers: () => { state.groupCleared++; markers.length = 0 },
          remove: () => { state.groupRemoved++ },
        }
        return group
      },
      circleMarker: (at: [number, number], opts: Record<string, unknown>) => ({
        addTo: () => { markers.push({ at, opts }) },
      }),
    },
  }
})
vi.mock('leaflet', () => ({ default: leaflet.default }))

const fakeMap = {
  getPane: (name: string) => leaflet.state.panes.get(name),
  createPane: (name: string) => {
    const pane = { style: {} as Record<string, string> }
    leaflet.state.panes.set(name, pane)
    return pane
  },
}
vi.mock('react-leaflet', () => ({ useMap: () => fakeMap }))

import { color } from '@/design-system/tokens'
import { GRID_KNOWN, GRID_WALKABLE, type SceneData, type SceneGrid } from '@/scene3d/types'
import { OutlierLayer, outlierPoints } from './OutlierLayer'

/**
 * A 10 x 10 m grid of 1 m cells with one 2 x 2 m walkable island in the
 * middle (cells x 4..5, y 4..5, i.e. 4..6 m on both axes). Big round numbers
 * so every distance in the tests can be read off by hand.
 */
function gridWithIsland(): SceneGrid {
  const bits = new Uint8Array(100)
  for (const y of [4, 5]) for (const x of [4, 5]) bits[y * 10 + x] = GRID_WALKABLE | GRID_KNOWN
  return { w: 10, h: 10, res: 1, origin: [0, 0], bits, content: { minX: 4, minY: 4, maxX: 5, maxY: 5 } }
}

/** A scene over that grid whose cloud is the given x,y points (height 0). */
function sceneOf(grid: SceneGrid, points: [number, number][]): SceneData {
  const xyh = new Float32Array(points.length * 3)
  points.forEach(([x, y], i) => { xyh[i * 3] = x; xyh[i * 3 + 1] = y; xyh[i * 3 + 2] = 0 })
  return {
    mapId: 'm', floorIndex: 0, floorZ: 0, grid,
    cloud: { count: points.length, xyh, cls: new Uint8Array(points.length) },
    hasPlanning: true,
  }
}

const pairs = (a: Float32Array) => {
  const out: [number, number][] = []
  for (let i = 0; i < a.length; i += 2) out.push([a[i], a[i + 1]])
  return out
}

describe('outlierPoints', () => {
  it('keeps a point well outside the walkable cells', () => {
    const far = sceneOf(gridWithIsland(), [[9.5, 9.5]])
    expect(pairs(outlierPoints(far, 2))).toEqual([[9.5, 9.5]])
  })

  it('drops a point standing on the walkable cells', () => {
    expect(outlierPoints(sceneOf(gridWithIsland(), [[4.5, 4.5]]), 2)).toHaveLength(0)
  })

  it('drops a point just outside them, inside the margin', () => {
    // 1.5 m from the island's edge: close enough to be the floor beside it.
    expect(outlierPoints(sceneOf(gridWithIsland(), [[7.5, 4.5]]), 2)).toHaveLength(0)
  })

  it('returns x,y pairs in cloud order, two floats per point', () => {
    const scene = sceneOf(gridWithIsland(), [[9.5, 9.5], [4.5, 4.5], [0.5, 9.5]])
    const out = outlierPoints(scene, 2)
    expect(out).toBeInstanceOf(Float32Array)
    expect(out).toHaveLength(4)
    expect(pairs(out)).toEqual([[9.5, 9.5], [0.5, 9.5]])
  })

  it('defaults to a 2 m margin', () => {
    const scene = sceneOf(gridWithIsland(), [[9.5, 9.5], [7.5, 4.5]])
    expect([...outlierPoints(scene)]).toEqual([...outlierPoints(scene, 2)])
  })

  it('widens with the margin, so a larger one keeps fewer points', () => {
    const scene = sceneOf(gridWithIsland(), [[9.5, 9.5]])
    expect(outlierPoints(scene, 1)).toHaveLength(2)
    expect(outlierPoints(scene, 8)).toHaveLength(0)
  })

  it('returns nothing for a scene with no cloud', () => {
    const scene = { ...sceneOf(gridWithIsland(), []), cloud: null }
    expect(outlierPoints(scene, 2)).toHaveLength(0)
  })

  it('returns nothing when the grid has no walkable cells to be outside of', () => {
    const bare = { ...gridWithIsland(), bits: new Uint8Array(100) }
    expect(outlierPoints(sceneOf(bare, [[9.5, 9.5], [0.5, 0.5]]), 2)).toHaveLength(0)
  })

  it('counts a point off the grid as a stray, without reading past the array', () => {
    const out = outlierPoints(sceneOf(gridWithIsland(), [[-40, -40], [400, 400]]), 2)
    expect(pairs(out)).toEqual([[-40, -40], [400, 400]])
  })
})

describe('OutlierLayer', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const mount = (data: SceneData): { root: Root; host: HTMLDivElement } => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<OutlierLayer data={data} />))
    return { root, host }
  }

  const reset = () => {
    leaflet.state.markers.length = 0
    leaflet.state.panes.clear()
    leaflet.state.groupRemoved = 0
    leaflet.state.rendererRemoved = 0
  }

  it('draws each stray as a small amber dot on its own pane, below the markers', () => {
    reset()
    const { root } = mount(sceneOf(gridWithIsland(), [[9.5, 9.5], [4.5, 4.5], [0.5, 9.5]]))
    // Leaflet takes [y, x], the map frame's reverse.
    expect(leaflet.state.markers.map((m) => m.at)).toEqual([[9.5, 9.5], [9.5, 0.5]])
    expect(leaflet.state.markers[0].opts).toMatchObject({ fillColor: color.amber, interactive: false, stroke: false })
    const [pane] = [...leaflet.state.panes.values()]
    expect(pane.style.pointerEvents).toBe('none')
    expect(Number(pane.style.zIndex)).toBeLessThan(600)
    act(() => root.unmount())
  })

  it('draws nothing at all when no stray survived, which is the honest answer', () => {
    reset()
    const { root } = mount(sceneOf(gridWithIsland(), [[4.5, 4.5]]))
    expect(leaflet.state.markers).toHaveLength(0)
    act(() => root.unmount())
  })

  it('draws at most 2000 dots, however many strays the cloud holds', () => {
    reset()
    // 3000 points in the far corner, every one of them an outlier.
    const many: [number, number][] = Array.from({ length: 3000 }, (_, i) => [9 + (i % 10) / 20, 9.5])
    const { root } = mount(sceneOf(gridWithIsland(), many))
    expect(leaflet.state.markers).toHaveLength(2000)
    act(() => root.unmount())
  })

  it('takes its pane, its canvas and its dots away when it unmounts', () => {
    reset()
    const { root } = mount(sceneOf(gridWithIsland(), [[9.5, 9.5]]))
    act(() => root.unmount())
    expect(leaflet.state.groupRemoved).toBe(1)
    expect(leaflet.state.rendererRemoved).toBe(1)
  })
})

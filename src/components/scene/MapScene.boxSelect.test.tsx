// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { SceneEditBox } from '@/scene3d/boxSelect'
import type { SceneData } from '@/scene3d/types'
import type { MapSceneProps } from './mapSceneProps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The engine stood in (no WebGL in jsdom), recording every call, as MapScene.test does. */
const engines = vi.hoisted(() => ({
  list: [] as Array<{ calls: [string, unknown[]][]; cb: Record<string, (...a: unknown[]) => void> }>,
}))
vi.mock('@/scene3d/engine/SceneEngine', () => {
  class FakeEngine {
    calls: [string, unknown[]][] = []
    cb: Record<string, (...a: unknown[]) => void> = {}
    static create() {
      const e = new FakeEngine()
      engines.list.push(e)
      return new Proxy(e, {
        get(target, prop: string) {
          if (prop in target) return (target as unknown as Record<string, unknown>)[prop]
          return (...args: unknown[]) => { target.calls.push([prop, args]) }
        },
      })
    }
    setCallbacks(cb: Record<string, (...a: unknown[]) => void>) { this.cb = cb }
    getStatus() { return { detached: false, hasRobot: false, previewing: false } }
    dispose() {}
  }
  return { SceneEngine: FakeEngine }
})

import { MapScene } from './MapScene'

const data: SceneData = {
  mapId: 'm', floorIndex: 0, floorZ: 0, hasPlanning: true,
  grid: { w: 4, h: 4, res: 0.5, origin: [0, 0], bits: new Uint8Array(16).fill(9), content: { minX: 0, minY: 0, maxX: 3, maxY: 3 } },
  cloud: { count: 2, xyh: new Float32Array(6), cls: new Uint8Array(2) },
}

let container: HTMLDivElement
let root: Root
const render = (over: Partial<MapSceneProps> = {}) => act(() => root.render(
  <MapScene data={data} views={['plan', 'fly']} view="plan" onViewChange={() => {}} followTarget="standin" pointerMode="tap" {...over} />))
const engine = () => engines.list[engines.list.length - 1]
const callsOf = (name: string) => engine().calls.filter(([n]) => n === name).map(([, a]) => a)
const lastOf = (name: string) => { const c = callsOf(name); return c[c.length - 1] }

beforeEach(() => {
  engines.list = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('box select is opt-in', () => {
  it('leaves every other scene as it was: box select off, no editor overlays built', () => {
    render()
    expect(callsOf('setBoxSelect')).toEqual([[false]])
    expect(callsOf('setEditBoxes')).toEqual([])
    expect(callsOf('setHighlightPoints')).toEqual([])
  })

  it('passes the editor its box select, boxes and amber points, and hears back the rectangles', () => {
    const onBoxDraft = vi.fn(), onBoxSelect = vi.fn()
    const boxes: SceneEditBox[] = [{ id: 'b', tone: 'staged', min: [0, 0, 0], max: [1, 1, 1] }]
    const highlight = Float32Array.from([1, 1, 0.5])
    render({ boxSelect: true, editBoxes: boxes, highlightPoints: highlight, onBoxDraft, onBoxSelect })
    expect(callsOf('setBoxSelect')).toEqual([[true]])
    expect(callsOf('setEditBoxes')).toEqual([[boxes]])
    expect(callsOf('setHighlightPoints')).toEqual([[highlight]])
    const rect = { x0: 0, y0: 0, x1: 1, y1: 2 }
    engine().cb.onBoxDraft(rect)
    engine().cb.onBoxSelect(rect)
    expect(onBoxDraft).toHaveBeenCalledWith(rect)
    expect(onBoxSelect).toHaveBeenCalledWith(rect)
    // Taking the boxes away clears them rather than leaving the old ones drawn.
    render({ boxSelect: false, onBoxDraft, onBoxSelect })
    expect(lastOf('setEditBoxes')).toEqual([[]])
    expect(lastOf('setHighlightPoints')).toEqual([null])
    expect(lastOf('setBoxSelect')).toEqual([false])
  })
})

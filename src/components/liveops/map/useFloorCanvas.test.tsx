// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneGrid } from '@/scene3d/types'

const paint = vi.hoisted(() => ({ paintFloor: vi.fn((_g: unknown, _p: unknown, canvas?: unknown) => canvas) }))
vi.mock('@/scene3d/paintFloor', () => ({ paintFloor: paint.paintFloor }))

import { paintFloorToUrl, usePaintedFloorUrl } from './useFloorCanvas'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const gridOf = (w: number): SceneGrid => ({
  w, h: 1, res: 1, origin: [0, 0], bits: new Uint8Array(w), content: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
})

let urls = 0
let context: object | null = {}
/** Blob callbacks held back until `release`, so a paint can be overtaken. */
let pending: (() => void)[] = []
let hold = false
const revoked: string[] = []

beforeEach(() => {
  urls = 0
  context = {}
  pending = []
  hold = false
  revoked.length = 0
  paint.paintFloor.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => {
    const done = () => cb(new Blob(['png']))
    if (hold) pending.push(done)
    else queueMicrotask(done)
  })
  URL.createObjectURL = vi.fn(() => `blob:${++urls}`)
  URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u) })
})
afterEach(() => { vi.restoreAllMocks() })

describe('paintFloorToUrl', () => {
  it('paints into a canvas and answers an object URL for its PNG', async () => {
    const grid = gridOf(3)
    expect(await paintFloorToUrl(grid, {} as never)).toBe('blob:1')
    expect(paint.paintFloor).toHaveBeenCalledWith(grid, {}, expect.any(HTMLCanvasElement))
  })

  it('answers null without painting when there is no 2D context', async () => {
    context = null
    expect(await paintFloorToUrl(gridOf(3), {} as never)).toBeNull()
    expect(paint.paintFloor).not.toHaveBeenCalled()
  })

  it('answers null when the encoder gives no blob', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null))
    expect(await paintFloorToUrl(gridOf(3), {} as never)).toBeNull()
  })
})

describe('usePaintedFloorUrl', () => {
  let host: HTMLDivElement
  let root: Root
  let seen: (string | null)[]

  function Probe({ grid }: { grid: SceneGrid | null }) {
    seen.push(usePaintedFloorUrl(grid))
    return null
  }

  beforeEach(() => {
    seen = []
    host = document.createElement('div')
    root = createRoot(host)
  })
  afterEach(() => { act(() => root.unmount()) })

  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  const latest = () => seen[seen.length - 1]

  it('is null with no grid, and paints nothing', async () => {
    act(() => root.render(<Probe grid={null} />))
    await settle()
    expect(latest()).toBeNull()
    expect(paint.paintFloor).not.toHaveBeenCalled()
  })

  it('does not show one floor\'s image under the next floor while that one paints', async () => {
    const a = gridOf(2)
    const b = gridOf(3)
    act(() => root.render(<Probe grid={a} />))
    await settle()
    expect(latest()).toBe('blob:1')

    hold = true
    act(() => root.render(<Probe grid={b} />))
    expect(latest()).toBeNull()
    hold = false
    await act(async () => { pending.forEach((f) => f()); await Promise.resolve() })
    await settle()
    expect(latest()).toBe('blob:2')
    expect(revoked).toEqual(['blob:1'])
  })

  it('throws away a paint that finishes after its grid was replaced', async () => {
    hold = true
    act(() => root.render(<Probe grid={gridOf(2)} />))
    act(() => root.render(<Probe grid={gridOf(3)} />))
    hold = false
    // Both paints finish, the first one last.
    await act(async () => { pending.reverse().forEach((f) => f()); await Promise.resolve() })
    await settle()
    expect(latest()).toBe('blob:1')
    expect(revoked).toEqual(['blob:2'])
  })
})

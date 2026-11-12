// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteMap } from '@/types/maps'

const net = vi.hoisted(() => ({ apiFetch: vi.fn(), artifactUrl: vi.fn() }))
vi.mock('@/lib/auth/apiFetch', () => ({ apiFetch: net.apiFetch }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { mapArtifactUrl: net.artifactUrl } }))

import { loadSceneData, useSceneData, type SceneDataState } from './useSceneData'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A unique map per test, so the session cache never carries between them. */
let seq = 0
const mapOf = (over: Partial<SiteMap['floors'][number]> = {}): SiteMap => ({
  map_id: `map-${++seq}`, site_id: 's', name: 'n', source: 'slam',
  extent_min: [0, 0], extent_max: [2, 1], created_at: 't', updated_at: 't',
  geodetic_anchor: null, status: 'active', zones: [],
  floors: [{
    index: 0, label: null, floor_z_m: -0.5, resolution_m: 1, origin_xy_m: [0, 0], size_cells: [2, 1],
    free_cells: 1, occupied_cells: 1, unknown_cells: 0, ...over,
  }],
})

const pgmBytes = (body: number[], w = 2, h = 1) =>
  new Uint8Array([...new TextEncoder().encode(`P5\n${w} ${h}\n255\n`), ...body]).buffer
const cloudBytes = (xyz: number[]) => {
  const v = new DataView(new ArrayBuffer(xyz.length * 4))
  xyz.forEach((n, i) => v.setFloat32(i * 4, n, true))
  return v.buffer
}
const answer = (status: number, body: ArrayBuffer = new ArrayBuffer(0)) =>
  ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => body })

/** Answers by the URL's last segment: `files.grid` etc., a number for a bare status. */
function serve(files: Partial<Record<'grid' | 'planning' | 'cloud', ReturnType<typeof answer> | Error>>) {
  net.apiFetch.mockImplementation(async (url: string) => {
    const kind = url.split('/').pop() as 'grid' | 'planning' | 'cloud'
    const r = files[kind] ?? answer(404)
    if (r instanceof Error) throw r
    return r
  })
}

beforeEach(() => {
  net.apiFetch.mockReset()
  net.artifactUrl.mockReset()
  net.artifactUrl.mockImplementation((id: string, i: number, kind: string) => `http://api/${id}/${i}/${kind}`)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('loadSceneData', () => {
  it('builds the grid, planning and classified cloud', async () => {
    serve({
      grid: answer(200, pgmBytes([254, 0])),
      planning: answer(200, pgmBytes([254, 0])),
      cloud: answer(200, cloudBytes([0.5, 0.5, -0.5, 1.5, 0.5, 0.5])),
    })
    const out = await loadSceneData(mapOf(), 0)
    expect(out.status).toBe('ready')
    if (out.status !== 'ready') return
    expect(out.data.hasPlanning).toBe(true)
    expect(out.data.grid.w).toBe(2)
    expect(out.data.floorZ).toBe(-0.5)
    expect(out.data.cloud?.count).toBe(2)
  })

  it('treats a 404 planning grid and a 404 or 413 cloud as absent, not as failure', async () => {
    serve({ grid: answer(200, pgmBytes([254, 0])), cloud: answer(413) })
    const out = await loadSceneData(mapOf(), 0)
    expect(out.status).toBe('ready')
    if (out.status !== 'ready') return
    expect(out.data.hasPlanning).toBe(false)
    expect(out.data.cloud).toBeNull()
  })

  it('does not ask for a planning grid the floor says it has none of', async () => {
    serve({ grid: answer(200, pgmBytes([254, 0])) })
    await loadSceneData(mapOf({ planning: null }), 0)
    expect(net.apiFetch.mock.calls.map((c) => String(c[0]).split('/').pop()).sort()).toEqual(['cloud', 'grid'])
  })

  it('is unavailable in mock mode, fetching nothing', async () => {
    net.artifactUrl.mockReturnValue('')
    expect((await loadSceneData(mapOf(), 0)).status).toBe('unavailable')
    expect(net.apiFetch).not.toHaveBeenCalled()
  })

  it('is unavailable for a floor with no grid, or no such floor', async () => {
    serve({})
    expect((await loadSceneData(mapOf(), 0)).status).toBe('unavailable')
    expect((await loadSceneData(mapOf(), 3)).status).toBe('unavailable')
  })

  it('builds once per survey and floor', async () => {
    serve({ grid: answer(200, pgmBytes([254, 0])) })
    const map = mapOf()
    const [a, b] = await Promise.all([loadSceneData(map, 0), loadSceneData({ ...map }, 0)])
    expect(a).toBe(b)
    expect(net.apiFetch).toHaveBeenCalledTimes(3)
    await loadSceneData({ ...map, updated_at: 'resurveyed' }, 0)
    expect(net.apiFetch).toHaveBeenCalledTimes(6)
  })

  it('reports an error, and does not cache it, when a file fails or cannot be read', async () => {
    const map = mapOf()
    serve({ grid: new Error('offline') })
    expect(await loadSceneData(map, 0)).toEqual({ status: 'error', reason: 'offline' })
    serve({ grid: answer(200, pgmBytes([254, 0])), cloud: answer(200, new ArrayBuffer(13)) })
    expect((await loadSceneData(map, 0)).status).toBe('error')
    serve({ grid: answer(500) })
    expect((await loadSceneData(map, 0)).status).toBe('error')
    serve({ grid: answer(200, new TextEncoder().encode('<html>').buffer as ArrayBuffer) })
    expect((await loadSceneData(map, 0)).status).toBe('error')
    serve({ grid: answer(200, pgmBytes([254, 0])) })
    expect((await loadSceneData(map, 0)).status).toBe('ready')
  })
})

describe('useSceneData', () => {
  let host: HTMLDivElement
  let root: Root
  const seen: SceneDataState[] = []
  function Probe({ map, floor }: { map: SiteMap | null; floor: number }) {
    seen.push(useSceneData(map, floor))
    return null
  }
  const render = async (map: SiteMap | null, floor = 0) => {
    await act(async () => { root.render(createElement(Probe, { map, floor })) })
  }
  const last = () => seen[seen.length - 1]

  beforeEach(() => {
    seen.length = 0
    host = document.createElement('div')
    root = createRoot(host)
  })
  afterEach(() => { act(() => root.unmount()) })

  it('is idle with no map', async () => {
    await render(null)
    expect(last()).toEqual({ status: 'idle', data: null })
  })

  it('goes from loading to ready', async () => {
    serve({ grid: answer(200, pgmBytes([254, 0])) })
    await render(mapOf())
    expect(seen[0].status).toBe('loading')
    expect(last().status).toBe('ready')
    expect(last().data?.grid.w).toBe(2)
  })

  it('is unavailable at once, with a reason, when the URL is empty', async () => {
    net.artifactUrl.mockReturnValue('')
    await render(mapOf())
    expect(seen[0].status).toBe('unavailable')
    expect(last().reason).toBeTruthy()
    expect(net.apiFetch).not.toHaveBeenCalled()
  })

  it('reports an error, and retries on the next mount', async () => {
    const map = mapOf()
    serve({ grid: new Error('offline') })
    await render(map)
    expect(last()).toMatchObject({ status: 'error', data: null, reason: 'offline' })
    act(() => root.unmount())
    root = createRoot(host)
    serve({ grid: answer(200, pgmBytes([254, 0])) })
    await render(map)
    expect(last().status).toBe('ready')
  })

  it('reloads for another floor', async () => {
    serve({ grid: answer(200, pgmBytes([254, 0])) })
    const map = mapOf()
    map.floors.push({ ...map.floors[0], index: 1 })
    await render(map, 0)
    expect(last().data?.floorIndex).toBe(0)
    await render(map, 1)
    expect(last().data?.floorIndex).toBe(1)
  })
})

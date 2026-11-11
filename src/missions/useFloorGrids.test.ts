import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockMaps } from '@/mocks/maps'

const net = vi.hoisted(() => ({ apiFetch: vi.fn(), artifactUrl: vi.fn() }))
vi.mock('@/lib/auth/apiFetch', () => ({ apiFetch: net.apiFetch }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { mapArtifactUrl: net.artifactUrl } }))

import { gridRequests, loadGrid } from './useFloorGrids'

const pgm = (body: number[]) => new Uint8Array([...new TextEncoder().encode('P5\n2 1\n255\n'), ...body])
const answer = (bytes: Uint8Array, ok = true) => ({ ok, status: ok ? 200 : 500, arrayBuffer: async () => bytes.buffer })

beforeEach(() => { net.apiFetch.mockReset(); net.artifactUrl.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('loadGrid', () => {
  it('fetches and decodes a floor grid', async () => {
    net.apiFetch.mockResolvedValue(answer(pgm([254, 0])))
    expect(await loadGrid('http://api/a', 'k-decode')).toEqual({ width: 2, height: 1, pixels: new Uint8Array([254, 0]) })
  })

  it('fetches a floor once, however many times it is asked', async () => {
    net.apiFetch.mockResolvedValue(answer(pgm([254, 0])))
    await Promise.all([loadGrid('http://api/b', 'k-once'), loadGrid('http://api/b', 'k-once')])
    await loadGrid('http://api/b', 'k-once')
    expect(net.apiFetch).toHaveBeenCalledTimes(1)
  })

  it('answers null, and tries again next time, when the fetch fails', async () => {
    net.apiFetch.mockResolvedValueOnce(answer(new Uint8Array(), false))
    expect(await loadGrid('http://api/c', 'k-fail')).toBeNull()
    net.apiFetch.mockResolvedValueOnce(answer(pgm([254, 0])))
    expect(await loadGrid('http://api/c', 'k-fail')).not.toBeNull()
  })

  it('answers null for a file that is not a grid, rather than a guess', async () => {
    net.apiFetch.mockResolvedValue(answer(new TextEncoder().encode('<html>sign in</html>')))
    expect(await loadGrid('http://api/d', 'k-html')).toBeNull()
  })
})

describe('gridRequests', () => {
  it('asks for nothing in mock mode, where the artifact URL is empty: fetch("") would re-request the page', () => {
    net.artifactUrl.mockReturnValue('')
    expect(gridRequests(mockMaps[0])).toEqual([])
  })

  it('asks for each floor, keyed by the survey so a re-survey is not served stale', () => {
    net.artifactUrl.mockImplementation((id: string, i: number, kind: string) => `http://api/${id}/${i}/${kind}`)
    const map = { ...mockMaps[0], floors: [mockMaps[0].floors[0], { ...mockMaps[0].floors[0], index: 1 }] }
    const [a, b] = gridRequests(map)
    expect(a.url).toBe('http://api/map-venue-survey/0/grid')
    expect(b.url).toBe('http://api/map-venue-survey/1/grid')
    expect(a.key).not.toBe(b.key)
    expect(gridRequests({ ...map, updated_at: 'later' })[0].key).not.toBe(a.key)
  })
})

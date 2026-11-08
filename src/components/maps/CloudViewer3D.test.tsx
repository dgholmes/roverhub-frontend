import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { mockMaps } from '@/mocks/maps'

const provider = vi.hoisted(() => ({ artifactUrl: '' }))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { mapArtifactUrl: () => provider.artifactUrl },
}))

import { useAuthStore } from '@/lib/auth/authStore'
import { CloudViewer3D, cameraDistance, fetchCloud, heightFractions, parseCloud } from './CloudViewer3D'
import { MapDetailPanel } from './MapDetailPanel'

const venue = mockMaps[0]

/** Little-endian float32 xyz triples, written byte by byte -- the wire format,
 *  independent of the host's own endianness. */
function wire(values: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 4)
  const view = new DataView(buffer)
  values.forEach((v, i) => view.setFloat32(i * 4, v, true))
  return buffer
}

beforeEach(() => { provider.artifactUrl = 'http://api.test/maps/map-venue-survey/floors/0/cloud' })

describe('fetchCloud', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ token: null })
  })

  it('sends the session token and cookies, as the artifact route needs with sign-in on', async () => {
    const fetchSpy = vi.fn(async () => new Response(new ArrayBuffer(12)))
    vi.stubGlobal('fetch', fetchSpy)
    useAuthStore.setState({ token: 'session-token' })
    const signal = new AbortController().signal
    const buffer = await fetchCloud('http://api.test/cloud', signal)
    expect(buffer.byteLength).toBe(12)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/cloud')
    expect(init.headers).toEqual({ Authorization: 'Bearer session-token' })
    expect(init.credentials).toBe('include')
    expect(init.signal).toBe(signal)
  })

  it('rejects on a refused request, so the panel says it could not read the cloud', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })))
    await expect(fetchCloud('http://api.test/cloud', new AbortController().signal)).rejects.toThrow('HTTP 401')
  })
})

describe('parseCloud', () => {
  it('parses float32 xyz triples into a points geometry', () => {
    const geometry = parseCloud(new Float32Array([1, 2, 3, 4, 5, 6]).buffer)
    expect(geometry.getAttribute('position').count).toBe(2)
    expect(Array.from(geometry.getAttribute('position').array)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('reads little-endian, as the converter writes it', () => {
    const geometry = parseCloud(wire([1.5, -2.25, 3]))
    expect(Array.from(geometry.getAttribute('position').array)).toEqual([1.5, -2.25, 3])
  })

  it('rejects a buffer whose length is not a multiple of 12', () => {
    expect(() => parseCloud(new ArrayBuffer(13))).toThrow(/multiple of 12/)
    expect(() => parseCloud(new ArrayBuffer(8))).toThrow(/multiple of 12/)
  })

  it('rejects an empty buffer: there is nothing to frame', () => {
    expect(() => parseCloud(new ArrayBuffer(0))).toThrow(/no points/i)
  })

  it('rejects NaN and infinity, which would poison the bounding sphere', () => {
    expect(() => parseCloud(wire([0, 0, 0, NaN, 0, 0]))).toThrow(/not finite/i)
    expect(() => parseCloud(wire([0, 0, Infinity]))).toThrow(/not finite/i)
  })

  it('colours points by height, lowest to highest', () => {
    const geometry = parseCloud(wire([0, 0, 0, 0, 0, 5, 0, 0, 10]))
    expect(geometry.getAttribute('height').count).toBe(3)
    expect(Array.from(geometry.getAttribute('height').array)).toEqual([0, 0.5, 1])
  })
})

describe('heightFractions', () => {
  it('normalises z to 0..1 across the cloud', () => {
    expect(Array.from(heightFractions(new Float32Array([0, 0, -2, 0, 0, 0, 0, 0, 2])))).toEqual([0, 0.5, 1])
  })

  it('puts a flat cloud at 0 rather than dividing by zero', () => {
    expect(Array.from(heightFractions(new Float32Array([0, 0, 3, 1, 1, 3])))).toEqual([0, 0])
  })
})

describe('cameraDistance', () => {
  it('backs off far enough that the whole bounding sphere is in view', () => {
    // A sphere of radius r fits a vertical field of view f from r / sin(f / 2).
    const fov = 50
    expect(cameraDistance(10, fov)).toBeGreaterThan(10 / Math.sin((fov / 2) * Math.PI / 180))
  })

  it('scales with the radius', () => {
    expect(cameraDistance(20, 50)).toBeCloseTo(cameraDistance(10, 50) * 2, 6)
  })
})

describe('CloudViewer3D', () => {
  it('renders a message instead of a canvas host when the floor has no cloud', () => {
    const html = renderToStaticMarkup(<CloudViewer3D url="" />)
    expect(html).toMatch(/no 3D cloud/i)
    expect(html).not.toContain('data-testid="cloud-viewport"')
  })

  it('renders the viewport host when there is a cloud to fetch', () => {
    const html = renderToStaticMarkup(<CloudViewer3D url="http://api.test/cloud" />)
    expect(html).toContain('data-testid="cloud-viewport"')
  })
})

describe('MapDetailPanel', () => {
  it('names the floor and offers the 3D view without opening it', () => {
    const html = renderToStaticMarkup(<MapDetailPanel map={venue} floorIndex={0} />)
    expect(html).toContain(venue.name)
    expect(html).toMatch(/show 3D/i)
    expect(html).toMatch(/aria-expanded="false"/)
    expect(html).not.toContain('cloud-viewport')
  })

  it('can start open, for a caller the operator has already asked', () => {
    const html = renderToStaticMarkup(<MapDetailPanel map={venue} floorIndex={0} defaultOpen />)
    expect(html).toMatch(/aria-expanded="true"/)
    expect(html).toMatch(/hide 3D/i)
  })

  it('says there is no cloud, and offers no 3D view, when the provider has no URL', () => {
    provider.artifactUrl = ''
    const html = renderToStaticMarkup(<MapDetailPanel map={venue} floorIndex={0} />)
    expect(html).toMatch(/no 3D cloud/i)
    expect(html).not.toMatch(/show 3D/i)
  })

  it('renders nothing for a floor the map does not have', () => {
    expect(renderToStaticMarkup(<MapDetailPanel map={venue} floorIndex={9} />)).toBe('')
  })

  it('draws no outlines', () => {
    const html = renderToStaticMarkup(<MapDetailPanel map={venue} floorIndex={0} />)
    expect(html).not.toMatch(/border:\s*\d+px solid/)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import type { SiteMap } from '@/types/maps'
import { mockMaps } from '@/mocks/maps'

// An ImageOverlay needs a live Leaflet map, which a node-environment test does
// not have. Stand it in with an <img> carrying the props that matter.
vi.mock('react-leaflet', () => ({
  ImageOverlay: (p: { url: string; bounds: unknown; opacity?: number; zIndex?: number }) => (
    <img data-testid="overlay" src={p.url} data-bounds={JSON.stringify(p.bounds)} data-opacity={p.opacity} data-z={p.zIndex} />
  ),
}))

const provider = vi.hoisted(() => ({ artifactUrl: '' }))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { mapArtifactUrl: () => provider.artifactUrl },
}))

import { FloorplanLayer, formatAreaM2 } from './FloorplanLayer'
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

beforeEach(() => { provider.artifactUrl = 'http://api.test/maps/map-venue-survey/floors/0/preview' })

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

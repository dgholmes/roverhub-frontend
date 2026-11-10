import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { mockMaps } from '@/mocks/maps'
import { noGoZones as mockNoGoZones, sampleSite } from '@/mocks/mockGeoZones'
import { NO_SAMPLE_SITE, type SampleSite } from '@/liveops/sampleSite'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { RobotState } from '@/types'
import type { MapZone, SiteMap } from '@/types/maps'

// HeroInset is the one production caller of MapCanvas's mini variant. It is
// rendered whole, with the real MapCanvas and zone layers, and Leaflet and the
// layers beside them stubbed: what is pinned is which zones the inset draws and
// over which bounds, given what useSiteMap -- the source every full view reads --
// returns.
const site = vi.hoisted(() => ({ map: undefined as unknown }))
vi.mock('@/liveops/useSiteMap', () => ({
  useSiteMap: () => ({ map: site.map, floorIndex: undefined, onFloorChange: () => {} }),
}))
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({
  MapContainer: (p: { children?: React.ReactNode; bounds?: unknown }) => (
    <div data-bounds={JSON.stringify(p.bounds)}>{p.children}</div>
  ),
  Polygon: (p: { positions: number[][] }) => <i data-layer="polygon" data-first={JSON.stringify(p.positions[0])} />,
  Tooltip: () => null,
}))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => [] }))
vi.mock('@/store/useSessionStore', () => ({ useSessionStore: () => () => {} }))
vi.mock('@/components/liveops/map/GridLayer', () => ({ GridLayer: () => null }))
vi.mock('@/components/liveops/map/RouteLayer', () => ({ RouteLayer: () => null }))
vi.mock('@/components/liveops/map/DockMarker', () => ({ DockMarker: () => null }))
vi.mock('@/components/liveops/map/AnnotationLayer', () => ({ AnnotationLayer: () => null }))
vi.mock('@/components/liveops/map/RobotMarker', () => ({ RobotMarker: () => null }))
vi.mock('@/components/liveops/map/MapControls', () => ({ MapControls: () => null }))
vi.mock('@/components/liveops/map/FitToSite', () => ({ FitToSite: () => null }))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({ FloorplanLayer: () => <i data-floorplan="" /> }))
vi.mock('@/components/liveops/map/FloorPicker', () => ({ FloorPicker: () => <i data-floorpicker="" /> }))
vi.mock('@/components/liveops/map/CloudControls', () => ({
  CloudToggle: () => <i data-cloudtoggle="" />, CloudPanelOverlay: () => null,
}))
vi.mock('./CameraThumb', () => ({ CameraThumb: () => null }))

import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { HeroInset } from './HeroInset'

const robot = { robot_id: 'r1' } as RobotState
const noGo: MapZone = {
  zone_id: 'zone-1', map_id: mockMaps[0].map_id, kind: 'no_go', label: 'Stairwell',
  polygon: [[0, 0], [1, 0], [1, 1]],
}
const fence: MapZone = {
  zone_id: 'zone-2', map_id: mockMaps[0].map_id, kind: 'geofence', label: 'Foyer',
  polygon: [[-2, -2], [3, -2], [3, 3], [-2, 3]],
}
const withZones = (zones: MapZone[]): SiteMap => ({ ...mockMaps[0], zones })
const inset = () => renderToStaticMarkup(
  <HeroInset showing="map" robot={robot} onSwap={() => {}} />,
)
const polygons = (html: string) => (html.match(/data-layer="polygon"/g) ?? []).length
const escaped = (v: unknown) => JSON.stringify(v).replace(/"/g, '&quot;')

// The mock provider answers its sample site, the real backend none: each test
// says which one the canvas is talking to.
const provider = { sample: sampleSite as SampleSite }
beforeEach(() => {
  site.map = undefined
  provider.sample = sampleSite
  vi.spyOn(dataProvider, 'sampleSite').mockImplementation(() => provider.sample)
})

describe('HeroInset (the Camera view\'s map inset)', () => {
  it('draws the surveyed map\'s boundary, not the mock site\'s', () => {
    site.map = withZones([noGo, fence])
    // The inset shows the geofence only: one polygon, starting at the map's
    // own first vertex ([y, x] on the canvas), not the mock perimeter's.
    const html = inset()
    expect(polygons(html)).toBe(1)
    expect(html).toContain('data-first="[-2,-2]"')
  })

  it('draws no boundary for a surveyed map that has no geofence', () => {
    site.map = withZones([noGo])
    expect(polygons(inset())).toBe(0)
    site.map = withZones([])
    expect(polygons(inset())).toBe(0)
  })

  it('draws the mock boundary only with the mock provider and no surveyed map at all', () => {
    site.map = undefined
    const html = inset()
    expect(polygons(html)).toBe(1)
    expect(html).toContain('data-first="[-20,-5]"')
    expect(mockNoGoZones.length).toBeGreaterThan(0) // and still no no-go zones in a mini
  })

  it('draws no boundary with no surveyed map on the real backend, rather than a made-up one', () => {
    provider.sample = NO_SAMPLE_SITE
    site.map = undefined
    expect(polygons(inset())).toBe(0)
  })

  it('looks as it always did: the floor\'s bounds, floorplan, picker and cloud toggle stay out', () => {
    site.map = withZones([fence])
    const html = inset()
    expect(html).toContain(`data-bounds="${escaped(MAP_BOUNDS)}"`)
    expect(html).not.toContain('data-floorplan')
    expect(html).not.toContain('data-floorpicker')
    expect(html).not.toContain('data-cloudtoggle')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { color } from '@/design-system/tokens'
import { mockMaps } from '@/mocks/maps'
import { geofence as mockGeofence, noGoZones as mockNoGoZones, sampleSite } from '@/mocks/mockGeoZones'
import { NO_SAMPLE_SITE, type SampleSite } from '@/liveops/sampleSite'
import type { RobotState } from '@/types'
import type { MapZone, SiteMap } from '@/types/maps'

// The canvas is rendered with Leaflet and everything beside the zone layers
// stood in: what this pins is which zones reach GeofenceLayer and NoGoZoneLayer.
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({
  MapContainer: (p: { children?: React.ReactNode; bounds?: unknown }) => (
    <div data-bounds={JSON.stringify(p.bounds)}>{p.children}</div>
  ),
  Polygon: (p: { positions: unknown[]; pathOptions?: { color?: string } }) => (
    <i data-layer="polygon" data-color={p.pathOptions?.color} data-points={p.positions.length} />
  ),
  Tooltip: () => null,
}))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => [] }))
vi.mock('@/store/useSessionStore', () => ({ useSessionStore: () => () => {} }))
vi.mock('./GridLayer', () => ({ GridLayer: () => null }))
vi.mock('./RouteLayer', () => ({ RouteLayer: () => null }))
vi.mock('./DockMarker', () => ({ DockMarker: () => null }))
vi.mock('./AnnotationLayer', () => ({
  AnnotationLayer: (p: { annotations?: readonly unknown[] }) => <i data-pins={p.annotations ? p.annotations.length : 'none'} />,
}))
// The provider is the one place that knows whether the site is made up: the
// mock answers its sample site, the real backend none (NO_SAMPLE_SITE).
const provider = vi.hoisted(() => ({ sample: undefined as unknown }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { sampleSite: () => provider.sample } }))
vi.mock('./RobotMarker', () => ({ RobotMarker: () => null }))
vi.mock('./MapControls', () => ({ MapControls: () => null }))
vi.mock('./FloorplanLayer', () => ({ FloorplanLayer: () => null }))
vi.mock('./FloorPicker', () => ({ FloorPicker: () => null }))
vi.mock('./CloudControls', () => ({ CloudToggle: () => null, CloudPanelOverlay: () => null }))
// Tap-to-go is its own layer with its own tests (NavGoalLayer.test.tsx); here
// it is stood in, to pin only where MapCanvas mounts it.
vi.mock('./NavGoalLayer', () => ({
  useNavGoal: () => ({ markers: {}, input: {}, tools: {}, bar: {} }),
  NavGoalMarkers: () => <i data-nav="markers" />,
  NavMapInput: () => <i data-nav="input" />,
  NavTools: (p: { top?: number; left?: number }) => <i data-nav="tools" data-at={`${p.top ?? ''},${p.left ?? ''}`} />,
  NavBar: () => <i data-nav="bar" />,
}))
vi.mock('./FitToSite', () => ({
  FitToSite: (p: { floor?: unknown; zones?: unknown[] }) => (
    <u data-fit-floor={p.floor ? 'yes' : 'no'} data-fit-zones={p.zones ? p.zones.length : 'none'} />
  ),
}))

import { MAP_BOUNDS, MapCanvas } from './MapCanvas'
import { boundsForFloor } from '@/liveops/mapFloor'

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
const render = (map?: SiteMap, variant: 'full' | 'mini' = 'full') =>
  renderToStaticMarkup(<MapCanvas robot={robot} map={map} variant={variant} />)
const polygons = (html: string) => (html.match(/data-layer="polygon"/g) ?? []).length
const withProvider = (sample: SampleSite) => { provider.sample = sample }

beforeEach(() => withProvider(sampleSite))

describe('MapCanvas zones', () => {
  it("hands the full view's fit the floor and the map's zones, so the opening view fits what is drawn", () => {
    const html = render(withZones([noGo, fence]))
    expect(html).toContain('data-fit-floor="yes"')
    expect(html).toContain('data-fit-zones="2"')
    expect(render(undefined)).toContain('data-fit-zones="none"')
  })

  it("draws the surveyed map's own zones, not the mock site's", () => {
    const html = render(withZones([noGo, fence]))
    expect(polygons(html)).toBe(2)             // one no-go, one geofence: not the mock's
    expect(html).toContain(`data-color="${color.red}"`)
  })

  it('draws nothing for a surveyed map with no zones, rather than the mock site\'s', () => {
    expect(polygons(render(withZones([])))).toBe(0)
  })

  it("draws the mock provider's sample site when there is no surveyed map", () => {
    expect(polygons(render(undefined))).toBe(mockNoGoZones.length + (mockGeofence.length ? 1 : 0))
  })

  it('draws no zones at all with no surveyed map on the real backend, rather than a made-up site', () => {
    withProvider(NO_SAMPLE_SITE)
    expect(polygons(render(undefined))).toBe(0)
    expect(polygons(render(undefined, 'mini'))).toBe(0)
  })

  it("draws only the surveyed map's geofence zones as the boundary on the real backend", () => {
    withProvider(NO_SAMPLE_SITE)
    const html = render(withZones([noGo, fence]), 'mini')   // the mini draws the boundary alone
    expect(polygons(html)).toBe(1)
    expect(html).toContain(`data-color="${color.t3}"`)
    expect(html).not.toContain(`data-color="${color.red}"`)
  })

  // These two cover MapCanvas's own contract when a caller hands the mini
  // variant a `map`. They do not show the app does: that is HeroInset.test.tsx,
  // which renders the one production mini caller.
  it("given a map, the mini variant draws that map's geofence and no no-go zones", () => {
    expect(polygons(render(withZones([noGo, fence]), 'mini'))).toBe(1)
    expect(polygons(render(withZones([noGo]), 'mini'))).toBe(0)
  })

  it("given a map, the mini variant keeps its own bounds rather than the floor's, so the inset looks as it always did", () => {
    const map = withZones([fence])
    expect(boundsForFloor(map.floors[0])).not.toEqual(MAP_BOUNDS)
    expect(render(map, 'mini')).toContain(`data-bounds="${JSON.stringify(MAP_BOUNDS).replace(/"/g, '&quot;')}"`)
    expect(render(map, 'full')).toContain(`data-bounds="${JSON.stringify(boundsForFloor(map.floors[0])).replace(/"/g, '&quot;')}"`)
  })
})

describe('MapCanvas annotations', () => {
  it("pins the mock provider's sample hazards, survey or not", () => {
    expect(render(undefined)).toContain(`data-pins="${sampleSite.annotations.length}"`)
    expect(render(withZones([]))).toContain(`data-pins="${sampleSite.annotations.length}"`)
  })

  it('pins none on the real backend: nobody placed them', () => {
    withProvider(NO_SAMPLE_SITE)
    expect(render(undefined)).toContain('data-pins="0"')
    expect(render(withZones([noGo, fence]))).toContain('data-pins="0"')
  })

  it('pins none in the mini inset', () => {
    expect(render(undefined, 'mini')).not.toContain('data-pins')
  })
})

describe('MapCanvas tap-to-go', () => {
  it('mounts the tools, bar, markers and input on the full view of a surveyed floor', () => {
    const html = render(withZones([]))
    for (const piece of ['tools', 'bar', 'markers', 'input']) expect(html).toContain(`data-nav="${piece}"`)
  })

  it('mounts none of it without a survey (RunPage, SnapshotMap) or in the mini inset', () => {
    expect(render(undefined)).not.toContain('data-nav=')
    expect(render(withZones([]), 'mini')).not.toContain('data-nav=')
  })

  it('puts the tool group where the view asks', () => {
    const html = renderToStaticMarkup(<MapCanvas robot={robot} map={withZones([])} navToolsAt={{ top: 12, left: 284 }} />)
    expect(html).toContain('data-at="12,284"')
  })
})

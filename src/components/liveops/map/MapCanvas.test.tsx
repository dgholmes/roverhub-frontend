import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { color } from '@/design-system/tokens'
import { mockMaps } from '@/mocks/maps'
import { geofence as mockGeofence, noGoZones as mockNoGoZones } from '@/mocks/mockGeoZones'
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
vi.mock('./AnnotationLayer', () => ({ AnnotationLayer: () => null }))
vi.mock('./RobotMarker', () => ({ RobotMarker: () => null }))
vi.mock('./MapControls', () => ({ MapControls: () => null }))
vi.mock('./FloorplanLayer', () => ({ FloorplanLayer: () => null }))
vi.mock('./FloorPicker', () => ({ FloorPicker: () => null }))
vi.mock('./CloudControls', () => ({ CloudToggle: () => null, CloudPanelOverlay: () => null }))
vi.mock('./FitToSite', () => ({ FitToSite: () => null }))

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

describe('MapCanvas zones', () => {
  it("draws the surveyed map's own zones, not the mock site's", () => {
    const html = render(withZones([noGo, fence]))
    expect(polygons(html)).toBe(2)             // one no-go, one geofence: not the mock's
    expect(html).toContain(`data-color="${color.red}"`)
  })

  it('draws nothing for a surveyed map with no zones, rather than the mock site\'s', () => {
    expect(polygons(render(withZones([])))).toBe(0)
  })

  it('still draws the mock zones when there is no surveyed map (RunPage, SnapshotMap)', () => {
    expect(polygons(render(undefined))).toBe(mockNoGoZones.length + (mockGeofence.length ? 1 : 0))
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

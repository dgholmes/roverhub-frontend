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
  MapContainer: (p: { children?: React.ReactNode }) => <div>{p.children}</div>,
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

import { MapCanvas } from './MapCanvas'

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

  it("passes the mini inset the map's zones too: a fictional boundary must not show there either", () => {
    // Mini draws the geofence only.
    expect(polygons(render(withZones([noGo, fence]), 'mini'))).toBe(1)
    expect(polygons(render(withZones([noGo]), 'mini'))).toBe(0)
  })
})

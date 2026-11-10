import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { color } from '@/design-system/tokens'
import { mockMaps } from '@/mocks/maps'
import { noGoZones as mockNoGoZones, sampleSite } from '@/mocks/mockGeoZones'
import type { MapZone, SiteMap } from '@/types/maps'

// Leaflet needs a live DOM and a node-environment test has none, so the pieces
// the editor draws with are stood in with elements carrying what is asserted.
// `data-layer` marks one drawn map layer; a vertex handle is not a layer.
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({
  MapContainer: (p: { children?: React.ReactNode }) => <div data-testid="map">{p.children}</div>,
  ImageOverlay: () => <i data-overlay="" />,
  Polygon: (p: { pathOptions?: { color?: string; dashArray?: string } }) => (
    <i data-layer="polygon" data-color={p.pathOptions?.color} data-dash={p.pathOptions?.dashArray ?? ''} />
  ),
  Polyline: (p: { positions: unknown[] }) => <i data-layer="polyline" data-points={p.positions.length} />,
  CircleMarker: () => <i data-vertex="" />,
  Tooltip: () => null,
  useMapEvents: () => null,
}))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { mapArtifactUrl: () => '' },
}))

import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { ZoneEditor } from './ZoneEditor'
import { FreezeControl } from './MapCurationPanel'

const venue = mockMaps[0]
const noGo: MapZone = {
  zone_id: 'zone-1', map_id: venue.map_id, kind: 'no_go', label: 'Stairwell',
  polygon: [[0, 0], [1, 0], [1, 1]],
}
const fence: MapZone = {
  zone_id: 'zone-2', map_id: venue.map_id, kind: 'geofence', label: 'Foyer',
  polygon: [[-2, -2], [3, -2], [3, 3], [-2, 3]],
}
const drawn: SiteMap = { ...venue, zones: [noGo, fence] }

const countLayers = (html: string) => (html.match(/data-layer="(?:polygon|polyline)"/g) ?? []).length
const render = (map: SiteMap, props: Partial<React.ComponentProps<typeof ZoneEditor>> = {}) =>
  renderToStaticMarkup(<ZoneEditor map={map} floorIndex={0} onSave={() => {}} {...props} />)

describe('ZoneEditor', () => {
  it('renders a layer for every saved zone plus the one being drawn', () => {
    expect(countLayers(render(drawn))).toBe(drawn.zones.length + 1)
    expect(countLayers(render(venue))).toBe(1)
  })

  it('draws a saved zone in the style the live map already uses for its kind', () => {
    const html = render(drawn)
    expect(html).toContain(`data-color="${color.red}"`)      // no_go: NoGoZoneLayer's red
    expect(html).toContain('data-dash="6 4"')                // geofence: GeofenceLayer's dashes
  })

  it('lists each zone with its label and kind', () => {
    const html = render(drawn)
    expect(html).toContain('Stairwell')
    expect(html).toContain('Foyer')
    expect(html).toMatch(/No-go/)
    expect(html).toMatch(/Geofence/)
  })

  it('flags a zone outside the surveyed extent rather than hiding it', () => {
    const outside: MapZone = { ...noGo, zone_id: 'zone-3', label: 'Old annex', polygon: [[100, 100], [101, 100], [101, 101]] }
    const html = render({ ...venue, zones: [noGo, outside] })
    expect(html).toContain('Old annex')
    expect(html.match(/Outside the surveyed area/g)).toHaveLength(1)
    expect(countLayers(html)).toBe(3)  // still drawn: flagged, never deleted
  })

  it('offers drawing and saving to an editor, and neither to a read-only viewer', () => {
    expect(render(drawn)).toMatch(/Draw a zone/)
    expect(render(drawn)).toMatch(/Save zones/)
    const readOnly = render(drawn, { readOnly: true })
    expect(readOnly).not.toMatch(/Draw a zone/)
    expect(readOnly).not.toMatch(/Save zones/)
    expect(readOnly).toContain('Stairwell')
  })

  it('has nothing to save until something changes', () => {
    expect(render(drawn)).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Save zones/)
  })

  it('says so when there are no zones', () => {
    expect(render(venue)).toMatch(/No zones yet/)
  })

  it('draws no outlines or side stripes', () => {
    const html = render(drawn)
    expect(html).not.toMatch(/border:\s*\d+px solid/)
    expect(html).not.toMatch(/border-left/i)
  })
})

describe('NoGoZoneLayer and GeofenceLayer with saved zones', () => {
  it('draws only no_go zones, one polygon each', () => {
    const html = renderToStaticMarkup(<NoGoZoneLayer zones={[noGo, fence]} />)
    expect(html.match(/data-layer="polygon"/g)).toHaveLength(1)
    expect(html).toContain(`data-color="${color.red}"`)
  })

  it('draws only geofence zones, one polygon each', () => {
    const html = renderToStaticMarkup(<GeofenceLayer zones={[noGo, fence]} />)
    expect(html.match(/data-layer="polygon"/g)).toHaveLength(1)
    expect(html).toContain('data-dash="6 4"')
  })

  it('draws nothing for an empty list of zones: a surveyed map with none is not the mock', () => {
    expect(renderToStaticMarkup(<NoGoZoneLayer zones={[]} />)).toBe('')
    expect(renderToStaticMarkup(<GeofenceLayer zones={[]} />)).toBe('')
  })

  it('draws nothing when given no list: the mock site comes from the mock provider, not the layer', () => {
    expect(renderToStaticMarkup(<NoGoZoneLayer />)).toBe('')
    expect(renderToStaticMarkup(<GeofenceLayer />)).toBe('')
  })

  it("draws the mock provider's sample site like any other zones, each layer its own kind", () => {
    expect(renderToStaticMarkup(<NoGoZoneLayer zones={sampleSite.zones} />).match(/data-layer="polygon"/g)).toHaveLength(mockNoGoZones.length)
    expect(renderToStaticMarkup(<GeofenceLayer zones={sampleSite.zones} />).match(/data-layer="polygon"/g)).toHaveLength(1)
  })
})

describe('FreezeControl', () => {
  const render = (map: SiteMap) => renderToStaticMarkup(<FreezeControl map={map} busy={false} onFreeze={() => {}} />)

  it('refuses to activate a map with no floors, and says why', () => {
    const html = render({ ...venue, floors: [], status: 'draft' })
    expect(html).toMatch(/<button[^>]*disabled=""/)
    expect(html).toMatch(/no floors/i)
  })

  it('offers to freeze a draft', () => {
    const html = render({ ...venue, status: 'draft' })
    expect(html).toMatch(/Freeze map/)
    expect(html).not.toMatch(/disabled=""/)
  })

  it('reports an active map as frozen instead of offering the button again', () => {
    const html = render({ ...venue, status: 'active' })
    expect(html).not.toMatch(/Freeze map/)
    expect(html).toMatch(/Frozen/)
  })
})

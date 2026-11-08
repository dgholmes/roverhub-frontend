import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { color } from '@/design-system/tokens'
import { mockMaps } from '@/mocks/maps'
import type { MissionWaypoint } from '@/types'
import type { MapZone, SiteMap } from '@/types/maps'
import type { GridPixels } from '@/missions/floorCells'

// Vitest runs in a node environment here: no DOM, no Leaflet map. Leaflet and the
// layers that need a live map are stood in with tags that carry the props that
// matter, and the grid hook is the seam (as useSiteMap is in HeroInset.test):
// the real MissionMapEditor, MapClickHandler and EditableRouteLayer render
// around it.
const seam = vi.hoisted(() => ({
  grids: {} as Record<number, unknown>,
  click: undefined as undefined | ((e: { latlng: { lat: number; lng: number } }) => void),
}))
vi.mock('@/missions/useFloorGrids', () => ({ useFloorGrids: () => seam.grids }))
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} }, divIcon: () => ({}) } }))
vi.mock('react-leaflet', () => ({
  MapContainer: (p: { children?: ReactNode; bounds?: unknown }) => (
    <div data-canvas="" data-bounds={JSON.stringify(p.bounds)}>{p.children}</div>
  ),
  CircleMarker: (p: { pathOptions: { color: string }; children?: ReactNode; center: number[] }) => (
    <i data-ring={p.pathOptions.color} data-at={JSON.stringify(p.center)}>{p.children}</i>
  ),
  Tooltip: (p: { children?: ReactNode }) => <b data-tooltip="">{p.children}</b>,
  Polyline: () => null,
  Marker: () => null,
  useMapEvents: (handlers: { click: (e: { latlng: { lat: number; lng: number } }) => void }) => { seam.click = handlers.click; return null },
}))
vi.mock('@/components/liveops/map/GridLayer', () => ({ GridLayer: () => null }))
vi.mock('./FitToRoute', () => ({ FitToRoute: () => null }))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({
  FloorplanLayer: (p: { floorIndex: number }) => <i data-floorplan={p.floorIndex} />,
}))
vi.mock('@/components/liveops/map/FloorPicker', () => ({ FloorPicker: () => <i data-floorpicker="" /> }))
vi.mock('@/components/liveops/map/GeofenceLayer', () => ({
  GeofenceLayer: (p: { zones?: readonly MapZone[] }) => <i data-geofence={p.zones ? p.zones.length : 'mock'} />,
}))
vi.mock('@/components/liveops/map/NoGoZoneLayer', () => ({
  NoGoZoneLayer: (p: { zones?: readonly MapZone[] }) => <i data-nogo={p.zones ? p.zones.length : 'mock'} />,
}))

import { MissionMapEditor } from './MissionMapEditor'

const venue = mockMaps[0]
// A 4 x 3 grid of 0.5 m cells with its lower-left corner at (-1, -2): the
// bottom-left cell is free, the top-right occupied, the rest never classified.
const FREE = 254, OCC = 0, UNK = 205
const grid: GridPixels = {
  width: 4, height: 3,
  pixels: new Uint8Array([UNK, UNK, UNK, OCC, UNK, UNK, UNK, UNK, FREE, UNK, UNK, UNK]),
}
const survey: SiteMap = {
  ...venue,
  zones: [{ zone_id: 'z', map_id: venue.map_id, kind: 'no_go', label: 'Stairwell', polygon: [[0, 0], [1, 0], [1, 1]] }],
  floors: [{ ...venue.floors[0], origin_xy_m: [-1, -2], resolution_m: 0.5, size_cells: [4, 3], floor_z_m: -0.34 }],
}
const wp = (id: string, x: number, y: number): MissionWaypoint => ({
  waypoint_id: id, label: id, x_m: x, y_m: y, z_m: null, heading_deg: null,
  tolerance_m: 0.5, actions: [], status: 'pending',
})
const onFree = wp('free', -0.75, -1.75)
const onUnknown = wp('unknown', 0.25, -1.75)
const onObstacle = wp('obstacle', 0.75, -0.75)

const base = { mapId: venue.map_id, selectedId: null, onSelect: () => {}, onAddWaypoint: vi.fn() }
const html = (props: Partial<Parameters<typeof MissionMapEditor>[0]>) =>
  renderToStaticMarkup(<MissionMapEditor {...base} waypoints={[]} map={survey} {...props} />)
const ring = (markup: string, id: string) => {
  // Markers are in waypoint order; find the one at this waypoint's [y, x].
  const w = [onFree, onUnknown, onObstacle].find((x) => x.waypoint_id === id)!
  const m = markup.match(new RegExp(`data-ring="([^"]*)" data-at="\\[${w.y_m},${w.x_m}\\]"`))
  return m?.[1]
}

beforeEach(() => {
  seam.grids = {}
  seam.click = undefined
  base.onAddWaypoint.mockReset()
})

describe('a missing map refuses to plan', () => {
  // These cover MissionMapEditor's contract with its caller: `map: null`.
  // Whether the app ever passes null is resolveMissionMap's, tested beside it,
  // and MissionEditor's wiring of the two is not covered by a test here.
  it('says the map is missing and offers no way to add a waypoint', () => {
    const markup = html({ mapId: 'map-deleted', map: null })
    expect(markup).toContain('data-testid="missing-map"')
    expect(markup).not.toContain('data-testid="planning-canvas"')
    expect(seam.click).toBeUndefined()   // MapClickHandler never mounted
  })

  it('draws no canvas at all, so there is no open-looking floor to click', () => {
    const markup = html({ mapId: 'map-deleted', map: null })
    expect(markup).toContain('map-deleted')
    expect(markup).not.toContain('data-canvas')
  })

  it('says it could not load the map, and not that it is missing, when it could not', () => {
    const markup = html({ map: null, refusal: 'unavailable' })
    expect(markup).toContain(i18n.t('missions.editor.mapUnavailableTitle'))
    expect(markup).not.toContain(i18n.t('missions.editor.mapMissingTitle'))
    expect(markup).not.toContain('data-canvas')
  })

  it('shows loading, with no canvas, until the map is known', () => {
    const markup = html({ map: null, refusal: 'loading' })
    expect(markup).toContain(i18n.t('missions.editor.mapLoading'))
    expect(markup).not.toContain('data-canvas')
  })

  it('offers to plan on the site\'s map, so a mission with a gone map is not stuck', () => {
    const replacement = { ...venue, name: 'Venue survey' }
    expect(html({ map: null, replacement, onReplace: () => {} }))
      .toContain(i18n.t('missions.editor.mapUseSite', { name: 'Venue survey' }))
    expect(html({ map: null })).not.toContain(i18n.t('missions.editor.mapUseSite', { name: 'Venue survey' }))
  })
})

describe('placing a waypoint on the surveyed floor', () => {
  it('converts the clicked point to map metres and records the floor it was placed on', () => {
    html({})
    seam.click!({ latlng: { lat: -4, lng: 2 } })
    // Leaflet is [y, x]; the floor's elevation is how a waypoint says which floor.
    expect(base.onAddWaypoint).toHaveBeenCalledWith(2, -4, -0.34)
  })

  it('records no elevation on the plain grid, where there is no floor', () => {
    html({ map: undefined })
    seam.click!({ latlng: { lat: 1, lng: 2 } })
    expect(base.onAddWaypoint).toHaveBeenCalledWith(2, 1, null)
  })
})

describe('a waypoint on ground the survey did not mark free', () => {
  beforeEach(() => { seam.grids = { 0: grid } })

  it('is ringed with the warning token, never the accent', () => {
    const markup = html({ waypoints: [onFree, onUnknown, onObstacle], selectedId: 'unknown' })
    expect(ring(markup, 'unknown')).toBe(color.amber)
    expect(ring(markup, 'obstacle')).toBe(color.amber)
    expect(ring(markup, 'unknown')).not.toBe(color.accent)   // even when selected
  })

  it('leaves a waypoint on free floor looking as it always did', () => {
    const markup = html({ waypoints: [onFree, onUnknown] })
    expect(ring(markup, 'free')).toBe(color.t2)
  })

  it('is flagged, not blocked: the click still places it', () => {
    html({ waypoints: [onUnknown] })
    seam.click!({ latlng: { lat: -1.75, lng: 0.25 } })   // that very cell
    expect(base.onAddWaypoint).toHaveBeenCalledWith(0.25, -1.75, -0.34)
  })

  it('says why, in the waypoint\'s own tooltip', () => {
    const markup = html({ waypoints: [onFree, onUnknown, onObstacle] })
    expect(markup).toContain(i18n.t('missions.editor.stepUnclassified'))
    expect(markup).toContain(i18n.t('missions.editor.stepOnObstacle'))
  })

  it('counts them in a caption, and omits the caption when there are none', () => {
    expect(html({ waypoints: [onFree, onUnknown, onObstacle] })).toContain(i18n.t('missions.editor.offFreeSummary', { count: 2 }))
    expect(html({ waypoints: [onFree] })).not.toContain('role="status"')
  })

  it('lets a validation error outrank the warning', () => {
    const markup = html({ waypoints: [onUnknown], flagged: { unknown: 'error' } })
    expect(ring(markup, 'unknown')).toBe(color.red)
  })

  it('says nothing while the grid has not loaded, rather than calling the floor free or blocked', () => {
    seam.grids = {}
    const markup = html({ waypoints: [onUnknown] })
    expect(ring(markup, 'unknown')).toBe(color.t2)
    expect(markup).not.toContain('role="status"')
  })
})

describe('the surveyed map under the editor', () => {
  it('draws the floorplan and the map\'s own zones, not the mock site\'s', () => {
    const markup = html({})
    expect(markup).toContain('data-floorplan="0"')
    expect(markup).toContain('data-nogo="1"')
    expect(markup).toContain('data-geofence="1"')
    expect(markup).toContain('data-bounds="[[-2,-1],[-0.5,1]]"')   // the floor's own bounds
  })

  it('is exactly the plain grid it always was with no map', () => {
    const markup = html({ map: undefined })
    expect(markup).not.toContain('data-floorplan')
    expect(markup).not.toContain('data-floorpicker')
    expect(markup).toContain('data-nogo="mock"')
    expect(markup).toContain('data-geofence="mock"')
  })

  it('offers a floor picker only when there is more than one floor', () => {
    expect(html({})).not.toContain('data-floorpicker')
    const upper: SiteMap = { ...survey, floors: [...survey.floors, { ...survey.floors[0], index: 1 }] }
    expect(html({ map: upper })).toContain('data-floorpicker')
  })
})

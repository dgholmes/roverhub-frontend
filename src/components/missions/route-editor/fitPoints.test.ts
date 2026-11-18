import { describe, expect, it } from 'vitest'
import type { MissionWaypoint } from '@/types'
import type { MapZone } from '@/types/maps'
import { fitPoints } from './fitPoints'

// `routeBounds` used to fall back to the mock site's perimeter, imported from
// src/mocks, whenever it was given no surveyed extent -- which is every
// RoutePreviewMap and the editor on any mission with no map. On the real
// backend that framed every route against a boundary belonging to nowhere,
// and one the canvas no longer even draws there. Audit 2026-11-18 §8.6.
//
// The rule now is the canvas's own: fit what is drawn. Callers pass the zones
// they draw -- a survey's, or the provider's sample site, which is the demo
// perimeter in mock mode and nothing on the real backend.
//
// Split out of FitToRoute so it can be tested without Leaflet.

const wp = (id: string, x_m: number, y_m: number) =>
  ({ waypoint_id: id, label: id, x_m, y_m } as MissionWaypoint)

const fence: MapZone = {
  zone_id: 'f', map_id: '', kind: 'geofence', label: 'perimeter',
  polygon: [[-5, -20], [60, -20], [60, 20], [-5, 20]],
}
const noGo: MapZone = {
  zone_id: 'n', map_id: '', kind: 'no_go', label: 'crane',
  polygon: [[1000, 1000], [1001, 1000], [1001, 1001]],
}

describe('fitPoints', () => {
  it('fits the route alone when nothing else is drawn', () => {
    expect(fitPoints([wp('a', 1, 2), wp('b', 3, 4)])).toEqual([[2, 1], [4, 3]])
  })

  it('fits the surveyed extent together with the route', () => {
    expect(fitPoints([wp('a', 1, 2)], [[0, 0], [10, 10]]))
      .toEqual([[0, 0], [10, 10], [2, 1]])
  })

  it('with no extent, fits the boundary that is drawn', () => {
    expect(fitPoints([wp('a', 1, 2)], undefined, [fence]))
      .toEqual([[-20, -5], [-20, 60], [20, 60], [20, -5], [2, 1]])
  })

  it('fits a boundary, never a no-go zone', () => {
    expect(fitPoints([wp('a', 1, 2)], undefined, [noGo])).toEqual([[2, 1]])
  })

  it('prefers the surveyed extent to a drawn boundary', () => {
    expect(fitPoints([], [[0, 0], [10, 10]], [fence])).toEqual([[0, 0], [10, 10]])
  })

  it('has nothing to fit for an empty route with nothing drawn', () => {
    // The real backend's case: no survey, and an empty sample site. The
    // caller then leaves the view where it was rather than framing a guess.
    expect(fitPoints([], undefined, [])).toEqual([])
  })
})

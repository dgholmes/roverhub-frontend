import { describe, expect, it } from 'vitest'
import type { MissionWaypoint } from '@/types'
import { fitPoints } from './fitPoints'

// `routeBounds` used to fall back to the mock site's perimeter when it was
// given no surveyed extent -- which is every RoutePreviewMap, and the editor
// whenever there is no map. The route then sat small in the middle of a view
// padded out to a boundary belonging to nowhere, and the operator had no way
// to know the empty space around their route was fictional rather than real
// site. Audit 2026-11-18 §8.6.
//
// Split out of FitToRoute so it can be tested without Leaflet, which wants a
// window.

const wp = (id: string, x_m: number, y_m: number) =>
  ({ waypoint_id: id, label: id, x_m, y_m } as MissionWaypoint)

describe('fitPoints', () => {
  it('fits the route when there is no surveyed extent', () => {
    expect(fitPoints([wp('a', 1, 2), wp('b', 3, 4)])).toEqual([[2, 1], [4, 3]])
  })

  it('fits the surveyed extent together with the route', () => {
    expect(fitPoints([wp('a', 1, 2)], [[0, 0], [10, 10]]))
      .toEqual([[0, 0], [10, 10], [2, 1]])
  })

  it('has nothing to fit for an empty route with no extent', () => {
    // Not the mock perimeter, and not the fixed MAP_BOUNDS envelope either:
    // the caller skips fitting and leaves the view where it was.
    expect(fitPoints([])).toEqual([])
  })

  it('never invents geometry of its own', () => {
    // The whole bug in one assertion: with one waypoint and no extent, the
    // only point to fit is that waypoint.
    expect(fitPoints([wp('only', 7, 8)])).toHaveLength(1)
  })
})

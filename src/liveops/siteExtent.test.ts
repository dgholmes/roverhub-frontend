import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import { geofence } from '@/mocks/mockGeoZones'
import { boundsForFloor } from './mapFloor'
import { NO_MAP_MARGIN_M, sitePoints } from './siteExtent'
import type { RobotState } from '@/types'
import type { MapZone } from '@/types/maps'

const robot = { position: { x_m: 1, y_m: 2 } } as RobotState
const mockPerimeter = geofence.map((p) => [p.y_m, p.x_m])

const zone = (kind: MapZone['kind'], polygon: MapZone['polygon']): MapZone => ({
  zone_id: `z-${kind}`, map_id: 'm', kind, label: kind, polygon,
})

describe('sitePoints', () => {
  it('is the same with no floor as with none given', () => {
    expect(sitePoints(robot, undefined, undefined)).toEqual(sitePoints(robot))
  })

  // Was: 'with no floor still fits the mock perimeter', imported straight from
  // src/mocks -- so on the real backend, where the canvas draws no sample site,
  // LiveOps' opening view was framed on a boundary nothing showed, anchored on
  // coordinates belonging to nowhere. The rule now is the canvas's own: fit
  // what is drawn. Audit 2026-11-18 §8.6.
  it('with no floor fits the boundary that is drawn', () => {
    // Mock mode: MapCanvas hands over the sample site, whose perimeter is the
    // one the old fallback used -- so the demo frames exactly as before.
    const sample = zone('geofence', geofence.map((p): [number, number] => [p.x_m, p.y_m]))
    expect(sitePoints(robot, undefined, undefined, [sample]))
      .toEqual(expect.arrayContaining(mockPerimeter))
  })

  it('with no floor and nothing drawn, frames the robot, not the mock site', () => {
    // The real backend with no survey: the sample site is empty.
    const points = sitePoints(robot, undefined, undefined, [])
    for (const p of mockPerimeter) expect(points).not.toContainEqual(p)
    const lats = points.map((p) => p[0])
    const lngs = points.map((p) => p[1])
    // A fixed margin, so Leaflet does not zoom to a single point, centred on
    // where the robot actually is. Nothing draws it as a boundary.
    expect(Math.max(...lats) - Math.min(...lats)).toBe(2 * NO_MAP_MARGIN_M)
    expect(Math.max(...lngs) - Math.min(...lngs)).toBe(2 * NO_MAP_MARGIN_M)
    expect((Math.max(...lats) + Math.min(...lats)) / 2).toBe(robot.position.y_m)
    expect((Math.max(...lngs) + Math.min(...lngs)) / 2).toBe(robot.position.x_m)
  })

  it('reaches for nothing in src/mocks', () => {
    const source = readFileSync(fileURLToPath(new URL('./siteExtent.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/from\s+['"]@\/mocks/)
  })

  it('with a floor fits its corners instead of the mock perimeter it no longer draws', () => {
    const floor = mockMaps[0].floors[0]
    const [sw, ne] = boundsForFloor(floor)
    const points = sitePoints(robot, undefined, floor)
    expect(points).toEqual(expect.arrayContaining([sw, ne, [2, 1]]))
    for (const p of mockPerimeter) expect(points).not.toContainEqual(p)
    expect(points).toHaveLength(3) // two corners and the robot
  })

  it('with a floor also fits the map\'s own geofence zones, but not its no-go zones', () => {
    const floor = mockMaps[0].floors[0]
    const zones = [
      zone('geofence', [[-30, -40], [30, -40], [30, 40]]),
      zone('no_go', [[1000, 1000], [1001, 1000], [1001, 1001]]),
    ]
    const points = sitePoints(robot, undefined, floor, zones)
    expect(points).toEqual(expect.arrayContaining([[-40, -30], [-40, 30], [40, 30]]))
    expect(points).not.toContainEqual([1000, 1000])
  })

  it('still adds the mission route and the robot', () => {
    const floor = mockMaps[0].floors[0]
    const mission = { waypoints: [{ x_m: 7, y_m: 8 }] } as never
    expect(sitePoints(robot, mission, floor)).toEqual(expect.arrayContaining([[8, 7], [2, 1]]))
  })

  // The grid rectangle is sized from the whole registered cloud, so on every
  // stored map it reaches far past anything the lidar classified -- 71% of the
  // active map's canvas holds no surveyed cell at all. Fitting it drew a real
  // office as a patch against one edge of the pane. See liveops/contentBounds.
  describe('given the surveyed content', () => {
    const content: [[number, number], [number, number]] = [[-2, -4], [2, 0]]

    it('frames the content instead of the grid', () => {
      const floor = mockMaps[0].floors[0]
      const points = sitePoints(robot, undefined, floor, [], content)
      expect(points).toEqual(expect.arrayContaining([[-2, -4], [2, 0]]))
      for (const corner of boundsForFloor(floor)) expect(points).not.toContainEqual(corner)
    })

    // Review Focus 1: an inset or a mission view that has lost the robot is
    // worse than one framed a little wide.
    it('still frames a robot standing outside the content', () => {
      const floor = mockMaps[0].floors[0]
      const far = { position: { x_m: 40, y_m: 41 } } as RobotState
      expect(sitePoints(far, undefined, floor, [], content)).toContainEqual([41, 40])
    })

    it('still frames the mission route', () => {
      const floor = mockMaps[0].floors[0]
      const mission = { waypoints: [{ x_m: 7, y_m: 8 }] } as never
      expect(sitePoints(robot, mission, floor, [], content)).toContainEqual([8, 7])
    })

    it('still frames the map\'s own geofence zones', () => {
      const floor = mockMaps[0].floors[0]
      const zones = [zone('geofence', [[-30, -40], [30, -40], [30, 40]])]
      expect(sitePoints(robot, undefined, floor, zones, content))
        .toEqual(expect.arrayContaining([[-40, -30], [-40, 30], [40, 30]]))
    })

    // Review Focus 2: before the grid is fetched there is no content box, and
    // a grid that was never trimmed has one covering the whole rectangle.
    // Neither may behave differently from before this existed.
    it('falls back to the grid corners when content is null', () => {
      const floor = mockMaps[0].floors[0]
      expect(sitePoints(robot, undefined, floor, [], null))
        .toEqual(sitePoints(robot, undefined, floor, []))
    })

    it('is ignored when there is no floor to replace', () => {
      expect(sitePoints(robot, undefined, undefined, [], content))
        .toEqual(sitePoints(robot, undefined, undefined, []))
    })
  })
})

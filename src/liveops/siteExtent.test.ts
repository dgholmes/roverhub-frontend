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

  // Was: 'with no floor still fits the mock perimeter'. With no surveyed floor
  // there is no site boundary, and framing the demo site's 65 x 40 m
  // perimeter put the operator's view somewhere the robot isn't -- anchored on
  // coordinates belonging to nowhere, with nothing to say the empty space was
  // fictional. Audit 2026-11-18 §8.6.
  it('with no floor frames the robot, not the mock perimeter', () => {
    const points = sitePoints(robot)
    for (const p of mockPerimeter) expect(points).not.toContainEqual(p)
    expect(points).toContainEqual([2, 1])
  })

  it('with no floor still gives the view something to fit', () => {
    // Fitting a single point zooms Leaflet to its maximum on the robot, which
    // is useless. A fixed margin around it is honest -- it is derived from
    // where the robot actually is, and nothing draws it as a boundary.
    const points = sitePoints(robot)
    const lats = points.map((p) => p[0])
    const lngs = points.map((p) => p[1])
    expect(Math.max(...lats) - Math.min(...lats)).toBe(2 * NO_MAP_MARGIN_M)
    expect(Math.max(...lngs) - Math.min(...lngs)).toBe(2 * NO_MAP_MARGIN_M)
    // ...centred on the robot, not on the demo site.
    expect((Math.max(...lats) + Math.min(...lats)) / 2).toBe(robot.position.y_m)
    expect((Math.max(...lngs) + Math.min(...lngs)) / 2).toBe(robot.position.x_m)
  })

  it('reaches for nothing in the mock site', () => {
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
})

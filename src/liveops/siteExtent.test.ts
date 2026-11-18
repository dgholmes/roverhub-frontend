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
})

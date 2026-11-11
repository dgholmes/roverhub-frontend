import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import { geofence } from '@/mocks/mockGeoZones'
import { boundsForFloor } from './mapFloor'
import { sitePoints } from './siteExtent'
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

  it('with no floor still fits the mock perimeter', () => {
    expect(sitePoints(robot)).toEqual(expect.arrayContaining(mockPerimeter))
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

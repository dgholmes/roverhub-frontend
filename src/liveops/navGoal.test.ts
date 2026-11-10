import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { GridPixels } from '@/missions/floorCells'
import type { MapFloor, MapZone, Point2D } from '@/types/maps'
import type { RobotPosition } from '@/types/robotState'
import {
  initialPoseFrom, navGoalFrom, navGoalWarning, navGotoParams, navRefusalKey,
  type InitialPose, type InitialPoseRefusal, type NavGoal, type NavGoalRefusal,
} from './navGoal'

// Same 4 x 3 grid as floorCells.test.ts: 0.5 m pitch, lower-left at (-1, -2),
// covering x in [-1, 1) and y in [-2, -0.5). Row 0 of the PGM is the TOP.
const FREE = 254, OCC = 0, UNK = 205
const floor: Pick<MapFloor, 'origin_xy_m' | 'resolution_m' | 'size_cells'> = {
  origin_xy_m: [-1, -2], resolution_m: 0.5, size_cells: [4, 3],
}
const grid: GridPixels = {
  width: 4, height: 3,
  pixels: new Uint8Array([
    UNK, UNK, UNK, OCC,   // y in [-1, -0.5)
    UNK, FREE, UNK, UNK,  // y in [-1.5, -1)
    FREE, UNK, UNK, UNK,  // y in [-2, -1.5)
  ]),
}
const FREE_PT: Point2D = [-0.75, -1.75]
const UNKNOWN_PT: Point2D = [0.25, -1.75]
const WALL_PT: Point2D = [0.75, -0.75]

const position = (over: Partial<RobotPosition> = {}): RobotPosition => ({
  x_m: 0, y_m: 0, z_m: 0, heading_deg: 0, provider: 'slam', quality: 'localized',
  accuracy_m: 0.1, freshness: 'live', updated_at: '2026-11-10T00:00:00Z', ...over,
})
const robot = { position: position() }

const zone = (kind: MapZone['kind'], polygon: Point2D[], label = 'Z'): Pick<MapZone, 'kind' | 'polygon' | 'label'> =>
  ({ kind, polygon, label })
// Covers the free cell at (-0.75, -1.75).
const NO_GO = zone('no_go', [[-1, -2], [-0.5, -2], [-0.5, -1.5], [-1, -1.5]], 'Stairs')

const goal = (r: NavGoal | NavGoalRefusal): NavGoal => {
  if (!r.ok) throw new Error(`expected a goal, got refusal ${r.reason}`)
  return r
}
const refusal = (r: NavGoal | NavGoalRefusal): NavGoalRefusal => {
  if (r.ok) throw new Error('expected a refusal, got a goal')
  return r
}
const pose = (r: InitialPose | InitialPoseRefusal): InitialPose => {
  if (!r.ok) throw new Error(`expected a pose, got refusal ${r.reason}`)
  return r
}

describe('navGoalFrom', () => {
  it('refuses a goal outside the floor extent', () => {
    expect(refusal(navGoalFrom([5, 5], floor, grid, robot)).reason).toBe('outsideFloor')
    expect(refusal(navGoalFrom([-1.01, -1.75], floor, grid, robot)).reason).toBe('outsideFloor')
    expect(refusal(navGoalFrom([1, -1.75], floor, grid, robot)).reason).toBe('outsideFloor') // upper edge is exclusive
  })

  it('refuses a goal inside a no-go zone and names it', () => {
    const r = refusal(navGoalFrom(FREE_PT, floor, grid, robot, [NO_GO]))
    expect(r.reason).toBe('inNoGo')
    expect(r.zone).toBe('Stairs')
  })

  it('accepts a goal on unknown ground, with a warning', () => {
    const g = goal(navGoalFrom(UNKNOWN_PT, floor, grid, robot))
    expect(g.cell).toBe('unknown')
    expect(navGoalWarning(g)).toBe('liveops.nav.warnUnknownGround')
  })

  it('treats a floor whose grid is not loaded as unknown ground, not free', () => {
    const g = goal(navGoalFrom(FREE_PT, floor, null, robot))
    expect(g.cell).toBe('unknown')
    expect(navGoalWarning(g)).not.toBeNull()
  })

  it('accepts a goal on free ground with no warning', () => {
    const g = goal(navGoalFrom(FREE_PT, floor, grid, robot))
    expect(g.cell).toBe('free')
    expect(navGoalWarning(g)).toBeNull()
  })

  it('refuses a goal on an occupied cell', () => {
    expect(refusal(navGoalFrom(WALL_PT, floor, grid, robot)).reason).toBe('occupied')
  })

  it('refuses when the robot has no localized position', () => {
    expect(refusal(navGoalFrom(FREE_PT, floor, grid, { position: position({ quality: 'lost' }) })).reason).toBe('positionLost')
    expect(refusal(navGoalFrom(FREE_PT, floor, grid, { position: null })).reason).toBe('noPosition')
    expect(refusal(navGoalFrom(FREE_PT, floor, grid, null)).reason).toBe('noPosition')
    expect(refusal(navGoalFrom(FREE_PT, floor, grid, {})).reason).toBe('noPosition')
  })

  it('refuses a goal when the robot is dead-reckoning, whatever its quality', () => {
    for (const quality of ['estimated', 'localized'] as const) {
      expect(refusal(navGoalFrom(FREE_PT, floor, grid, { position: position({ provider: 'dead_reckoning', quality }) })).reason)
        .toBe('positionNotOnMap')
    }
  })

  it('accepts a goal while SLAM is still converging (quality estimated)', () => {
    expect(navGoalFrom(FREE_PT, floor, grid, { position: position({ quality: 'estimated' }) }).ok).toBe(true)
  })

  it('judges the robot before it looks at the map', () => {
    expect(refusal(navGoalFrom([5, 5], floor, grid, { position: position({ quality: 'lost' }) })).reason).toBe('positionLost')
  })

  it('refuses a no-go goal even on a wall, and ignores zones of other kinds', () => {
    const wallZone = zone('no_go', [[0.5, -1], [1, -1], [1, -0.5], [0.5, -0.5]])
    expect(refusal(navGoalFrom(WALL_PT, floor, grid, robot, [wallZone])).reason).toBe('inNoGo')
    expect(navGoalFrom(FREE_PT, floor, grid, robot, [zone('geofence', [[5, 5], [6, 5], [6, 6]])]).ok).toBe(true)
  })

  it('accepts a goal outside every geofence, with a warning (as a mission waypoint is)', () => {
    const fence = zone('geofence', [[0, -2], [1, -2], [1, -0.5], [0, -0.5]])
    const g = goal(navGoalFrom(FREE_PT, floor, grid, robot, [fence]))
    expect(g.outsideGeofence).toBe(true)
    expect(navGoalWarning(g)).toBe('liveops.nav.warnOutsideGeofence')
  })

  it('does not warn about geofences when the goal is inside one, or when there are none', () => {
    const fence = zone('geofence', [[-1, -2], [1, -2], [1, -0.5], [-1, -0.5]])
    expect(goal(navGoalFrom(FREE_PT, floor, grid, robot, [fence])).outsideGeofence).toBe(false)
    expect(goal(navGoalFrom(FREE_PT, floor, grid, robot, [])).outsideGeofence).toBe(false)
    expect(goal(navGoalFrom(FREE_PT, floor, grid, robot)).outsideGeofence).toBe(false)
  })

  it('reports the outside-geofence warning ahead of unknown ground', () => {
    const fence = zone('geofence', [[-1, -2], [-0.6, -2], [-0.6, -1.6], [-1, -1.6]])
    expect(navGoalWarning(goal(navGoalFrom(UNKNOWN_PT, floor, grid, robot, [fence])))).toBe('liveops.nav.warnOutsideGeofence')
  })

  it('carries a heading when one is given, null when not', () => {
    expect(goal(navGoalFrom(FREE_PT, floor, grid, robot)).yaw_rad).toBeNull()
    expect(goal(navGoalFrom(FREE_PT, floor, grid, robot, undefined, Math.PI / 2)).yaw_rad).toBeCloseTo(Math.PI / 2)
  })
})

describe('initialPoseFrom', () => {
  it('allows an initial pose on unknown ground', () => {
    expect(initialPoseFrom(UNKNOWN_PT, undefined, floor, grid).ok).toBe(true)
  })

  it('allows an initial pose with no grid loaded', () => {
    expect(initialPoseFrom(UNKNOWN_PT, undefined, floor, null).ok).toBe(true)
  })

  it('refuses outside the floor extent and inside a wall', () => {
    const outside = initialPoseFrom([5, 5], undefined, floor, grid)
    const wall = initialPoseFrom(WALL_PT, undefined, floor, grid)
    expect(!outside.ok && outside.reason).toBe('outsideFloor')
    expect(!wall.ok && wall.reason).toBe('occupied')
  })

  it('takes the heading from the drag, anticlockwise from +x', () => {
    expect(pose(initialPoseFrom([0, -1.75], [0, -1.25], floor, grid)).yaw_rad).toBeCloseTo(Math.PI / 2)
    expect(Math.abs(pose(initialPoseFrom([0, -1.75], [-1, -1.75], floor, grid)).yaw_rad as number)).toBeCloseTo(Math.PI)
  })

  it('leaves the heading null when no real drag was made', () => {
    expect(pose(initialPoseFrom(FREE_PT, undefined, floor, grid)).yaw_rad).toBeNull()
    expect(pose(initialPoseFrom(FREE_PT, FREE_PT, floor, grid)).yaw_rad).toBeNull()
    expect(pose(initialPoseFrom(FREE_PT, [FREE_PT[0] + 0.01, FREE_PT[1]], floor, grid)).yaw_rad).toBeNull()
  })
})

describe('navGotoParams', () => {
  it('produces exactly the wire shape of NavGotoParams', () => {
    const g = goal(navGoalFrom(FREE_PT, floor, grid, robot, undefined, 1.5))
    expect(navGotoParams(g, 'map-venue', '0')).toEqual({
      x_m: -0.75, y_m: -1.75, yaw_rad: 1.5, map_id: 'map-venue', floor_id: '0',
    })
  })

  it('sends a null yaw when the operator gave no heading', () => {
    expect(navGotoParams(goal(navGoalFrom(FREE_PT, floor, grid, robot)), 'm', '0').yaw_rad).toBeNull()
  })
})

// Keys here are a union and only some take {{zone}}, so call t untyped.
const text = (key: string, lng: 'en' | 'ko', zone: string) => (i18n.t as (k: string, o: object) => string)(key, { lng, zone })

describe('copy', () => {
  const reasons = ['noPosition', 'positionNotOnMap', 'positionLost', 'outsideFloor', 'inNoGo', 'occupied'] as const
  const keys = [...reasons.map(navRefusalKey), 'liveops.nav.warnUnknownGround', 'liveops.nav.warnOutsideGeofence']

  it('has English and Korean text for every refusal and warning key', () => {
    for (const lng of ['en', 'ko'] as const) {
      for (const key of keys) {
        expect(i18n.exists(key, { lng }), `${lng} ${key}`).toBe(true)
        expect(text(key, lng, 'Stairs').length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps Korean text distinct from English', () => {
    for (const key of keys) {
      expect(text(key, 'ko', 'Z')).not.toBe(text(key, 'en', 'Z'))
    }
  })
})

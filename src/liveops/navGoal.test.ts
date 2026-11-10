import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { GridPixels } from '@/missions/floorCells'
import type { MapFloor, MapZone, Point2D } from '@/types/maps'
import type { RobotPosition } from '@/types/robotState'
import type { NavGoalStatus } from '@/types/robotState'
import {
  formatDistanceM, initialPoseFrom, navGoalFrom, navGoalOutcome, navGoalWarning, navGotoParams, navRefusalKey,
  navRefusalText, readNavGoal, resetPositionParams, robotPlacementProblem,
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

describe('navGotoParams guards', () => {
  it('refuses a non-finite yaw rather than send it (the bridge would reject NaN, and Infinity is no heading)', () => {
    for (const yaw of [NaN, Infinity, -Infinity]) {
      expect(() => navGotoParams({ x_m: 1, y_m: 2, yaw_rad: yaw }, 'm', '0')).toThrow(RangeError)
    }
  })

  it('refuses a non-finite point', () => {
    expect(() => navGotoParams({ x_m: NaN, y_m: 2, yaw_rad: null }, 'm', '0')).toThrow(RangeError)
    expect(() => navGotoParams({ x_m: 1, y_m: Infinity, yaw_rad: null }, 'm', '0')).toThrow(RangeError)
  })
})

describe('resetPositionParams', () => {
  it('sends the heading in DEGREES anticlockwise from +x, converted from the drag radians', () => {
    const p = pose(initialPoseFrom([0, -1.75], [0, -1.25], floor, grid)) // drag straight up: +90 deg
    expect(resetPositionParams(p, 'map-venue', '0')).toEqual({
      x_m: 0, y_m: -1.75, heading_deg: expect.closeTo(90, 6), map_id: 'map-venue', floor_id: '0',
    })
    const left = pose(initialPoseFrom([0, -1.75], [-1, -1.75], floor, grid))
    expect(Math.abs(resetPositionParams(left, 'm', '0')!.heading_deg)).toBeCloseTo(180)
  })

  it('has exactly the wire fields of ResetPositionParams', () => {
    const p = resetPositionParams({ ok: true, x_m: 1, y_m: 2, yaw_rad: 0 }, 'm', '0')
    expect(Object.keys(p!).sort()).toEqual(['floor_id', 'heading_deg', 'map_id', 'x_m', 'y_m'])
  })

  it('returns null with no heading: AMCL cannot be seeded without one', () => {
    expect(resetPositionParams({ ok: true, x_m: 1, y_m: 2, yaw_rad: null }, 'm', '0')).toBeNull()
    expect(resetPositionParams({ ok: true, x_m: 1, y_m: 2, yaw_rad: NaN }, 'm', '0')).toBeNull()
  })
})

describe('robotPlacementProblem', () => {
  it('is null only for a SLAM position that has not lost lock', () => {
    expect(robotPlacementProblem({ position: position() })).toBeNull()
    expect(robotPlacementProblem({ position: position({ quality: 'estimated' }) })).toBeNull()
    expect(robotPlacementProblem({ position: position({ quality: 'lost' }) })).toBe('positionLost')
    expect(robotPlacementProblem({ position: position({ provider: 'dead_reckoning' }) })).toBe('positionNotOnMap')
    expect(robotPlacementProblem({ position: null })).toBe('noPosition')
    expect(robotPlacementProblem(undefined)).toBe('noPosition')
  })
})

describe('navRefusalText', () => {
  it('names the zone in the no-go refusal, in both languages', async () => {
    const r: NavGoalRefusal = { ok: false, reason: 'inNoGo', zone: 'Loading dock' }
    expect(navRefusalText(r)).toContain('Loading dock')
    await i18n.changeLanguage('ko')
    try {
      expect(navRefusalText(r)).toContain('Loading dock')
      expect(navRefusalText(r)).not.toBe(text('liveops.nav.refuse.inNoGo', 'en', 'Loading dock'))
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

const status = (over: Partial<NavGoalStatus> = {}): NavGoalStatus => ({
  goal_id: 'g1', x_m: 1, y_m: 2, yaw_rad: null, map_id: 'm', state: 'active', reason: null,
  updated_at: '2026-11-10T00:00:00Z', ...over,
})

describe('readNavGoal (nav_goal arrives unvalidated from MQTT)', () => {
  it('passes a well-formed status through', () => {
    expect(readNavGoal(status())).toEqual(status())
  })

  it('drops anything whose state is not one of the five', () => {
    expect(readNavGoal({ ...status(), state: 'walking' })).toBeNull()
    expect(readNavGoal({ ...status(), state: undefined })).toBeNull()
  })

  it('drops non-finite or missing coordinates', () => {
    expect(readNavGoal({ ...status(), x_m: NaN })).toBeNull()
    expect(readNavGoal({ ...status(), y_m: '2' })).toBeNull()
    expect(readNavGoal({ ...status(), x_m: undefined })).toBeNull()
  })

  it('drops non-objects and a missing goal id', () => {
    for (const raw of [null, undefined, 'active', 3, [], { ...status(), goal_id: 7 }]) expect(readNavGoal(raw)).toBeNull()
  })

  it('reads a non-string reason as no reason, and a bad yaw as none', () => {
    expect(readNavGoal({ ...status(), reason: 42 })?.reason).toBeNull()
    expect(readNavGoal({ ...status(), yaw_rad: 'x' })?.yaw_rad).toBeNull()
  })
})

describe('navGoalOutcome: a finished goal in plain words', () => {
  const ended = (state: NavGoalStatus['state'], reason: string | null) => navGoalOutcome(status({ state, reason }))

  it('is nothing while the goal is still walking', () => {
    expect(ended('active', null)).toBeNull()
  })

  it('says Arrived on success', () => {
    expect(ended('succeeded', null)).toEqual({ tone: 'green', text: 'Arrived' })
  })

  it.each([
    ['localization_lost', /lost its place/i],
    ['estop', /emergency stop/i],
    ['operator_has_control', /operator took control/i],
    ['operator_took_control', /operator took control/i],
    ['battery_critical', /battery critically low/i],
    ['battery_unknown', /battery level unknown/i],
    ['joy_unusable: remote active', /handheld remote/i],
    ['joy_unusable: robot in ready', /not standing/i],
    ['joy_unusable: link unavailable: no ros', /cannot be driven/i],
    ['supervisor_error: RuntimeError(boom)', /internal error/i],
    ['nav2_aborted', /could not find a way/i],
    ['nav2_silent', /stopped responding/i],
    ['superseded', /newer goal/i],
    ['operator', /pressed Stop/i],
    ['scan_stale', /can no longer see obstacles/i],
    ['scan_stale: lidar', /can no longer see obstacles/i],
    ['scan_stale: front', /can no longer see obstacles/i],
    ['scan_stale: back', /can no longer see obstacles/i],
    ['in_no_go_zone', /no-go zone/i],
    ['in_no_go_zone: Loading Crane Radius', /no-go zone/i],
    ['outside_geofence', /outside the site boundary/i],
    ['outside_geofence: 2.1 m out', /outside the site boundary/i],
    ['zones_not_loaded', /no zones for this map/i],
    ['zones_not_loaded: no zone file for map-venue-survey', /no zones for this map/i],
    ['robot_state_stale', /has not heard from the robot/i],
    ['robot_state_stale: no /state for 1.7 s', /has not heard from the robot/i],
    ['robot_fallen', /fallen over/i],
    ['robot_fallen: posture fallen', /fallen over/i],
    ['leg_timeout', /took too long/i],
    ['leg_timeout: 95 s', /took too long/i],
    ['off_target', /short of the point/i],
    ['off_target: 0.8 m away', /short of the point/i],
  ])('words %s as a reason after "Stopped:"', (reason, words) => {
    const o = navGoalOutcome(status({ state: 'aborted', reason }))!
    expect(o.text).toMatch(/^Stopped: /)
    expect(o.text).toMatch(words)
    // Never the wire's identifier: no snake_case head, no colon detail.
    if (reason.includes('_')) expect(o.text).not.toContain(reason.split(':')[0])
    expect(o.text.slice('Stopped: '.length)).not.toContain(':')
    // ...and never the detail: not the scan's name, the zone's label or the why.
    const detail = reason.split(':').slice(1).join(':').trim()
    if (detail && !['remote active', 'robot in ready'].includes(detail)) expect(o.text).not.toContain(detail)
  })

  it('says "site boundary" for outside_geofence, as Missions does, not "geofence"', () => {
    expect(ended('refused', 'outside_geofence')!.text).not.toMatch(/geofence/i)
  })

  it('falls back to a generic line for a reason this build does not know, never the raw string', () => {
    for (const state of ['aborted', 'canceled', 'refused'] as const) {
      const o = ended(state, 'something_new_from_a_newer_bridge')!
      expect(o.text.length).toBeGreaterThan(0)
      expect(o.text).not.toContain('something_new')
    }
    expect(ended('aborted', null)!.text).not.toContain('null')
  })

  it('colours a stop by what it means: canceled is neutral, aborted and refused are red', () => {
    expect(ended('canceled', 'operator')!.tone).toBe('neutral')
    expect(ended('aborted', 'nav2_aborted')!.tone).toBe('red')
    expect(ended('refused', 'operator_has_control')!.tone).toBe('red')
  })

  it('has Korean for every reason it words', async () => {
    const reasons = ['localization_lost', 'estop', 'operator_has_control', 'battery_critical', 'battery_unknown',
      'joy_unusable: remote active', 'joy_unusable: robot in ready', 'joy_unusable: x', 'supervisor_error: x',
      'nav2_aborted', 'nav2_silent', 'nav2_canceled', 'nav2_rejected', 'superseded', 'operator', 'release_control',
      'bridge_stopping', 'nav_link: down', 'scan_stale: lidar', 'in_no_go_zone: Stairwell', 'outside_geofence',
      'zones_not_loaded: no zone file', 'unknown_thing']
    const en = reasons.map((r) => navGoalOutcome(status({ state: 'aborted', reason: r }))!.text)
    await i18n.changeLanguage('ko')
    try {
      reasons.forEach((r, i) => {
        const ko = navGoalOutcome(status({ state: 'aborted', reason: r }))!.text
        expect(ko, r).not.toBe(en[i])
        expect(ko, r).not.toMatch(/[a-z]{4,}/) // no English left in the Korean line
      })
      expect(navGoalOutcome(status({ state: 'succeeded' }))!.text).toBe('도착했습니다')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('formatDistanceM', () => {
  it('shows one decimal under 10 m and whole metres above', () => {
    expect(formatDistanceM(3.42)).toBe('3.4')
    expect(formatDistanceM(0.04)).toBe('0.0')
    expect(formatDistanceM(12.6)).toBe('13')
  })
})

describe('Korean copy', () => {
  it('words unknown ground with 측량 (survey), not 조사', () => {
    const ko = text('liveops.nav.warnUnknownGround', 'ko', '')
    expect(ko).toContain('측량')
    expect(ko).not.toContain('조사')
  })
})

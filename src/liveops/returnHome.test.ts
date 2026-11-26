import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { MapFloor, SiteMap } from '@/types/maps'
import type { RobotRunView } from './robotRun'
import { isReturningHome, returnHomeAvailability, returnHomeTarget } from './returnHome'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_B2 = 'c'.repeat(64)

const floor = (index: number, content_hash: string, home: MapFloor['home'] = null): MapFloor => ({
  index, label: null, floor_z_m: 0, resolution_m: 0.05, origin_xy_m: [-10, -10], size_cells: [400, 400],
  free_cells: 1, occupied_cells: 1, unknown_cells: 1, content_hash, home,
})
const siteMap = (map_id: string, floors: MapFloor[]): SiteMap => ({
  map_id, site_id: 'site-office', name: map_id, source: 'slam', extent_min: [-10, -10], extent_max: [10, 10],
  created_at: '', updated_at: '', geodetic_anchor: null, floors, status: 'active', zones: [],
})
const home = (x_m: number, y_m: number, yaw_rad = 0) => ({ x_m, y_m, yaw_rad, set_at: '2026-11-26T02:00:00Z', set_by: 'u-ana' })

/** The map the page happens to show, with a home of its own. */
const pageMap = siteMap('map-page', [floor(0, HASH_A, home(1, 1))])
/** The map the robot runs: two floors, home on the upper one. */
const robotsMap = siteMap('map-robot', [floor(0, HASH_B, home(0.5, 0.5)), floor(1, HASH_B2, home(5, 6, 1.57))])

const robot = (over: Partial<RobotState> = {}, bridge: Partial<NonNullable<RobotState['bridge']>> = {}): RobotState => ({
  ...initialRobots[1],
  abstract_state: 'STAND', sdk_state: 'balance_stand', control_owner: null, active_run: null, nav_goal: null,
  position: { ...initialRobots[1].position, x_m: 2, y_m: 2, provider: 'slam', quality: 'localized' },
  ...over,
  bridge: { ...initialRobots[1].bridge!, nav_map_id: 'map-robot', nav_map_hash: HASH_B2, ...bridge },
})

describe('returnHomeTarget', () => {
  it("takes the home of the robot's own map and floor, never the page's (Review Focus 5)", () => {
    // The page's map comes first, as if the console were showing it.
    const t = returnHomeTarget(robot(), [pageMap, robotsMap])
    expect(t.ok).toBe(true)
    if (!t.ok) return
    expect(t.params).toEqual({ x_m: 5, y_m: 6, yaw_rad: 1.57, map_id: 'map-robot', floor_id: '1', map_hash: HASH_B2 })
  })

  it('on a map with one floor, takes that floor even without a hash', () => {
    const t = returnHomeTarget(robot({}, { nav_map_id: 'map-page', nav_map_hash: null }), [pageMap, robotsMap])
    expect(t.ok && t.params).toEqual({ x_m: 1, y_m: 1, yaw_rad: 0, map_id: 'map-page', floor_id: '0', map_hash: HASH_A })
  })

  it('refuses when the robot has no map, the map is not on this site, the floor is unknown, or it has no home', () => {
    expect(returnHomeTarget(robot({}, { nav_map_id: null }), [robotsMap])).toEqual({ ok: false, reason: 'noMap' })
    expect(returnHomeTarget(robot({}, { nav_map_id: 'map-elsewhere' }), [robotsMap])).toEqual({ ok: false, reason: 'noMap' })
    expect(returnHomeTarget(robot({}, { nav_map_hash: 'd'.repeat(64) }), [robotsMap])).toEqual({ ok: false, reason: 'noFloor' })
    const bare = siteMap('map-robot', [floor(0, HASH_B), floor(1, HASH_B2)])
    expect(returnHomeTarget(robot(), [bare])).toEqual({ ok: false, reason: 'noHome' })
  })
})

describe('returnHomeAvailability', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  const paused: NonNullable<RobotRunView> = {
    phase: 'paused', runId: 'r1', missionName: null, stepLabel: null, blockId: null, redoStepLabel: null,
    startedAt: '', owner: null, youHoldControl: false, estimateS: null, pausedFor: 'estop',
  }

  it('is enabled with the params to send when everything is in place', () => {
    vi.stubEnv('VITE_USE_REAL_BACKEND', 'true')
    const a = returnHomeAvailability(robot(), null, [pageMap, robotsMap])
    expect(a.enabled).toBe(true)
    expect(a.params?.map_id).toBe('map-robot')
  })

  it('says why not: no home, a mission, not placed, E-Stop', () => {
    const bare = siteMap('map-robot', [floor(0, HASH_B), floor(1, HASH_B2)])
    expect(returnHomeAvailability(robot(), null, [bare]).reason).toBe('No home is set on this floor. Set one on the Map page.')
    // A mission first: that is what the operator has to deal with.
    expect(returnHomeAvailability(robot(), paused, [bare]).reason).toBe('Stop the mission first')
    const lost = robot({ position: { ...robot().position, quality: 'lost' } })
    const notPlaced = returnHomeAvailability(lost, null, [robotsMap])
    expect(notPlaced.enabled).toBe(false)
    expect(notPlaced.reason).toMatch(/Set position/i)
    const latched = returnHomeAvailability(robot({ abstract_state: 'E_STOP' }), null, [robotsMap])
    expect(latched.enabled).toBe(false)
    expect(latched.params).toBeUndefined()
  })
})

describe('isReturningHome', () => {
  const goal = (state: 'active' | 'stuck' | 'succeeded', purpose: 'goto' | 'return') => ({
    goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: 0, map_id: 'm', state, reason: null, updated_at: '', purpose,
  })
  it('is true only while a walk home is under way', () => {
    expect(isReturningHome(robot({ nav_goal: goal('active', 'return') }))).toBe(true)
    expect(isReturningHome(robot({ nav_goal: goal('stuck', 'return') }))).toBe(true)
    expect(isReturningHome(robot({ nav_goal: goal('succeeded', 'return') }))).toBe(false)
    expect(isReturningHome(robot({ nav_goal: goal('active', 'goto') }))).toBe(false)
    expect(isReturningHome(robot())).toBe(false)
  })
})

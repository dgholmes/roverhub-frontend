import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry, MissionWaypoint } from '@/types'
import { DEFAULT_CONSTRAINTS } from '@/types'
import { validateMission, type CheckContext } from './validate'

const wp = (id: string, x: number, y: number): MissionWaypoint =>
  ({ waypoint_id: id, label: id, x_m: x, y_m: y, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' })

const square = [{ x_m: 4, y_m: -2 }, { x_m: 6, y_m: -2 }, { x_m: 6, y_m: 2 }, { x_m: 4, y_m: 2 }]
const ctx: CheckContext = { noGoZones: [{ id: 'z', label: 'Crane', points: square }], geofences: [square], robotType: null }

const program = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  waypoints: [], segments: [], program_state: '{}', ...patch,
})
const route = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry =>
  program({ kind: 'route', program_state: undefined, ...patch })
const codes = (m: MissionLibraryEntry, c: CheckContext = ctx) => validateMission(m, c).issues.map((i) => i.code)

describe('validateMission, program kind', () => {
  it('does not ask a program for waypoints', () => {
    expect(codes(program())).not.toContain('noWaypoints')
    expect(codes(program())).not.toContain('oneWaypoint')
    expect(validateMission(program(), ctx).status).toBe('valid')
  })

  it('does not warn about a single stray waypoint either', () => {
    expect(codes(program({ waypoints: [wp('a', 0, 0)] }))).not.toContain('oneWaypoint')
  })

  it('skips zone and geofence checks: a program has no map frame to check', () => {
    // Waypoints on a program are a contract violation, but if one slips
    // through, a zone verdict about them would be about a path that does not
    // exist -- so none is given.
    const found = codes(program({ waypoints: [wp('a', 0, 0), wp('b', 5, 0), wp('c', 20, 20)] }))
    for (const c of ['inNoGo', 'crossesNoGo', 'nearNoGo', 'outsideSite']) expect(found).not.toContain(c)
  })

  it('skips the per-leg gait check', () => {
    const m = program({
      waypoints: [wp('a', 0, 5), wp('b', 10, 5)],
      segments: [{ from_waypoint_id: 'a', to_waypoint_id: 'b', speed_mps: null, gait: 'flying_trot', posture: null, wheel_leg_mode: null }],
    })
    expect(codes(m, { ...ctx, robotType: 'wheel' })).not.toContain('gaitNotForRobot')
  })

  it('still runs the recording check', () => {
    expect(codes(program({ recording: { enabled: true, cameras: [] } }))).toContain('recordingNoCameras')
  })

  it('still runs the timed-announcement checks', () => {
    const at = (t: string, clip_id: string) => ({ announcement_id: t, clip_id, text: null, volume: 1, at: t, repeat_every_min: null, until: null })
    const found = codes(program({ announcements: [at('06:05', ''), at('09:00', 'c')] }))
    expect(found).toContain('timedNoClip')
    // Whether one falls inside a schedule's window is a check on the task, not the mission (taskPanel).
    expect(found).not.toContain('timedOutsideWindow')
  })

  it('still runs the mission-level constraint checks', () => {
    const m = program({ constraints: { ...DEFAULT_CONSTRAINTS, stairs_allowed: true } })
    expect(codes(m, { ...ctx, robotType: 'wheel' })).toContain('stairsOnWheel')
  })
})

describe('validateMission, route kind is unchanged', () => {
  it('still asks for waypoints', () => {
    expect(codes(route())).toEqual(['noWaypoints'])
  })

  it('still checks zones and the geofence', () => {
    const found = codes(route({ waypoints: [wp('a', 0, 0), wp('b', 5, 0)] }))
    expect(found).toContain('inNoGo')
    expect(found).toContain('outsideSite')
  })
})

// A mission planned on a map that is not the one loaded has no zones to be
// checked against. Checking it against some other map's polygons would give a
// green tick it never earned, so the zone checks do not run and it says so.
describe('validateMission, zones not checked', () => {
  const unchecked: CheckContext = { noGoZones: [], geofences: [], zonesNotChecked: true, robotType: null }
  const inside = route({ waypoints: [wp('a', 5, 0), wp('b', 20, 20)] })   // would be inNoGo + outsideSite

  it('runs no zone check, and says so, as an info issue', () => {
    const found = validateMission(inside, unchecked).issues
    expect(found.map((i) => i.code)).toEqual(['zonesNotChecked'])
    expect(found[0].severity).toBe('info')
    expect(found[0].waypoint_id).toBeNull()
  })

  it('is "unvalidated", not "valid", when nothing else is wrong: no tick it did not earn', () => {
    expect(validateMission(inside, unchecked).status).toBe('unvalidated')
  })

  it('still reports the problems it can find, as invalid', () => {
    const clipless = { announcement_id: 'x', clip_id: '', text: null, volume: 1, at: '09:00', repeat_every_min: null, until: null }
    const m = route({ waypoints: [wp('a', 0, 0), wp('b', 5, 5)], announcements: [clipless] })
    const v = validateMission(m, unchecked)
    expect(v.status).toBe('invalid')
    expect(v.issues.map((i) => i.code)).toContain('timedNoClip')
  })

  it('does not apply to a program, which has no map frame to check anyway', () => {
    const v = validateMission(program(), unchecked)
    expect(v.issues.map((i) => i.code)).not.toContain('zonesNotChecked')
    expect(v.status).toBe('valid')
  })

  it('is silent when the zones were checked', () => {
    expect(codes(route({ waypoints: [wp('a', 0, 0), wp('b', 0, 5)] }), { ...ctx, geofences: [] })).not.toContain('zonesNotChecked')
  })
})

// --- What the backend's route compiler refuses (schema 0.0.16) --------------
//
// A route runs as walk-to-point legs that the backend compiles when the run
// starts (roverhub-backend missions/route_steps.py). These codes say ahead of
// time what that compiler would refuse, so Run now is not offered for a route
// that would only come back refused.

describe('validateMission, what a route run cannot do yet', () => {
  const clear: CheckContext = { noGoZones: [], geofences: [], robotType: 'quad' }
  const two = [wp('a', 0, 0), wp('b', 5, 0)]
  const action = (type: MissionWaypoint['actions'][number]['type']) => ({ type, label: type, params: {} })

  it('refuses the actions the robot cannot run yet, at their waypoint', () => {
    for (const type of ['video_clip', 'led_signal', 'operator_approval', 'return_to_dock'] as const) {
      const v = validateMission(route({ waypoints: [two[0], { ...two[1], actions: [action(type)] }], recording: { enabled: true, cameras: ['front'] } }), clear)
      const hit = v.issues.find((i) => i.code === 'actionNotRunnable')
      expect(hit, type).toMatchObject({ severity: 'error', waypoint_id: 'b' })
      expect(v.status).toBe('invalid')
    }
  })

  it('runs snapshots, waits and announcements with a clip', () => {
    const acts = [action('snapshot'), action('wait'), { type: 'voice_prompt' as const, label: 'hi', params: { clip_id: 'c1' } }]
    const v = validateMission(route({ waypoints: [two[0], { ...two[1], actions: acts }] }), clear)
    expect(v.issues.map((i) => i.code)).not.toContain('actionNotRunnable')
    expect(v.status).toBe('valid')
  })

  it('refuses a leg that asks for a gait other than walk, a posture or a wheel mode', () => {
    for (const seg of [{ gait: 'flying_trot' as const }, { posture: 'low' }, { wheel_leg_mode: 'x' as const }]) {
      const m = route({ waypoints: two, segments: [{ from_waypoint_id: 'a', to_waypoint_id: 'b', speed_mps: null, gait: null, posture: null, wheel_leg_mode: null, ...seg }] })
      expect(validateMission(m, clear).issues.find((i) => i.code === 'gaitNotWalk'), JSON.stringify(seg)).toMatchObject({ severity: 'error', waypoint_id: 'b' })
    }
    const walk = route({ waypoints: two, segments: [{ from_waypoint_id: 'a', to_waypoint_id: 'b', speed_mps: 0.4, gait: 'walk', posture: null, wheel_leg_mode: null }] })
    expect(codes(walk, clear)).not.toContain('gaitNotWalk')
  })

  it('refuses stairs, a human-proximity rule and timed announcements on a route', () => {
    expect(codes(route({ waypoints: two, constraints: { ...DEFAULT_CONSTRAINTS, stairs_allowed: true } }), clear)).toContain('stairsNotRunnable')
    expect(codes(route({ waypoints: two, constraints: { ...DEFAULT_CONSTRAINTS, human_proximity_policy: 'slow' } }), clear)).toContain('proximityNotRunnable')
    const timed = { announcement_id: 'x', clip_id: 'c1', text: null, volume: 1, at: '09:00', repeat_every_min: null, until: null }
    expect(codes(route({ waypoints: two, announcements: [timed] }), clear)).toContain('announcementsNotRunnable')
  })

  it('leaves a program alone: it does not run as a route', () => {
    const m = program({ constraints: { ...DEFAULT_CONSTRAINTS, stairs_allowed: true, human_proximity_policy: 'slow' } })
    for (const c of ['stairsNotRunnable', 'proximityNotRunnable']) expect(codes(m, clear)).not.toContain(c)
  })
})

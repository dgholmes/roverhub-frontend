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

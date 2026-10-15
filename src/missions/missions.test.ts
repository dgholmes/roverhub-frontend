import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry, MissionWaypoint } from '@/types'
import { computeEstimates, DEFAULT_SPEED_MPS } from './estimates'
import { pointInPolygon, segmentPolygonDist } from './geometry'
import { addDays, occurrencesInWeek, runsOn, weekStart, weekday } from './schedule'
import { validateMission, type CheckContext } from './validate'

const wp = (id: string, x: number, y: number, actions: MissionWaypoint['actions'] = []): MissionWaypoint =>
  ({ waypoint_id: id, label: id, x_m: x, y_m: y, z_m: null, heading_deg: null, tolerance_m: 0.5, actions, status: 'pending' })

const mission = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', library_status: 'draft', creator: 'x', updated_at: '', map_id: 'map',
  waypoints: [wp('a', 0, 0), wp('b', 10, 0)], segments: [], ...patch,
})

const square = [{ x_m: 4, y_m: -2 }, { x_m: 6, y_m: -2 }, { x_m: 6, y_m: 2 }, { x_m: 4, y_m: 2 }]
const ctx: CheckContext = { noGoZones: [{ id: 'z', label: 'Crane', points: square }], geofence: null, robotType: null }
const codes = (m: MissionLibraryEntry, c = ctx) => validateMission(m, c).issues.map((i) => i.code)

describe('geometry', () => {
  it('finds points inside and legs through a zone', () => {
    expect(pointInPolygon({ x_m: 5, y_m: 0 }, square)).toBe(true)
    expect(segmentPolygonDist({ x_m: 0, y_m: 0 }, { x_m: 10, y_m: 0 }, square)).toBe(0)
    expect(segmentPolygonDist({ x_m: 0, y_m: 5 }, { x_m: 10, y_m: 5 }, square)).toBeCloseTo(3)
  })
})

describe('validateMission', () => {
  it('flags a leg crossing a no-go zone as an error', () => {
    const v = validateMission(mission(), ctx)
    expect(v.status).toBe('invalid')
    expect(codes(mission())).toContain('crossesNoGo')
  })
  it('flags a waypoint inside a zone, not also the legs into it', () => {
    const m = mission({ waypoints: [wp('a', 0, 0), wp('b', 5, 0)] })
    expect(codes(m)).toEqual(['inNoGo'])
  })
  it('warns when a waypoint is within the clearance', () => {
    expect(codes(mission({ waypoints: [wp('a', 0, 5), wp('b', 3.5, 5), wp('c', 3.5, 0)] }))).toContain('nearNoGo')
  })
  it('passes a clear route', () => {
    expect(validateMission(mission({ waypoints: [wp('a', 0, 5), wp('b', 10, 5)] }), ctx).status).toBe('valid')
  })
  it('rejects a gait the assigned robot type does not have', () => {
    const m = mission({
      waypoints: [wp('a', 0, 5), wp('b', 10, 5)],
      segments: [{ from_waypoint_id: 'a', to_waypoint_id: 'b', speed_mps: null, gait: 'flying_trot', posture: null, wheel_leg_mode: null }],
    })
    expect(codes(m, { ...ctx, robotType: 'wheel' })).toContain('gaitNotForRobot')
    expect(codes(m, { ...ctx, robotType: 'quad' })).not.toContain('gaitNotForRobot')
  })
  it('warns about return to dock before the last stop, and empty missions', () => {
    expect(codes(mission({ waypoints: [wp('a', 0, 5, [{ type: 'return_to_dock', label: '', params: {} }]), wp('b', 10, 5)] }))).toContain('returnNotLast')
    expect(codes(mission({ waypoints: [] }))).toEqual(['noWaypoints'])
  })
})

describe('computeEstimates', () => {
  it('adds leg times at the default speed and action times', () => {
    const e = computeEstimates(mission({ waypoints: [wp('a', 0, 0), wp('b', 10, 0, [{ type: 'snapshot', label: '', params: {} }])] }))
    expect(e.length_m).toBe(10)
    expect(e.duration_s).toBeCloseTo(10 / DEFAULT_SPEED_MPS + 3)
    expect(e.energy_wh).toBeNull()
  })
})

describe('schedule', () => {
  it('knows weekdays and Mondays', () => {
    expect(weekday('2026-10-12')).toBe(0)
    expect(weekStart('2026-10-15')).toBe('2026-10-12')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('runs weekly schedules on their days only, from the start date', () => {
    const s = { schedule_id: 's', recurrence: 'weekly' as const, start_at: '2026-10-13T06:00', timezone: 'Asia/Seoul', days_of_week: [0, 2], window_minutes: null }
    expect(runsOn(s, '2026-10-12')).toBe(false)
    expect(runsOn(s, '2026-10-14')).toBe(true)
    expect(runsOn(s, '2026-10-19')).toBe(true)
    expect(runsOn(s, '2026-10-20')).toBe(false)
  })
  it('marks clashes for the same robot only', () => {
    const daily = (id: string, robot: string, time: string): MissionLibraryEntry => mission({
      mission_id: id, robot_id: robot,
      schedule: { schedule_id: id, recurrence: 'daily', start_at: `2026-10-12T${time}`, timezone: 'Asia/Seoul', days_of_week: [], window_minutes: null },
    })
    const occ = occurrencesInWeek([daily('a', 'r1', '06:00'), daily('b', 'r1', '06:10'), daily('c', 'r2', '06:00')], '2026-10-12')
    expect(occ).toHaveLength(21)
    expect(occ.filter((o) => o.clash).every((o) => o.robot_id === 'r1')).toBe(true)
    expect(occ.filter((o) => o.clash)).toHaveLength(14)
  })
})

describe('task checks', () => {
  const clear = (patch: Partial<MissionLibraryEntry> = {}) => mission({ waypoints: [wp('a', 0, 5), wp('b', 10, 5)], ...patch })
  it('an announcement task with no clip is an error on that waypoint', () => {
    const m = clear({ waypoints: [wp('a', 0, 5, [{ type: 'voice_prompt', label: 'Hi', params: {} }]), wp('b', 10, 5)] })
    const v = validateMission(m, ctx)
    expect(v.issues.find((i) => i.code === 'announcementNoClip')?.waypoint_id).toBe('a')
    expect(v.status).toBe('invalid')
  })
  it('video tasks need whole-run recording on', () => {
    const m = clear({
      waypoints: [wp('a', 0, 5, [{ type: 'video_clip', label: 'Clip', params: { seconds: 15 } }]), wp('b', 10, 5)],
      recording: { enabled: false, cameras: ['front'] },
    })
    expect(codes(m)).toContain('videoWithoutRecording')
  })
  it('a timed announcement before a once schedule starts is a warning', () => {
    const m = clear({
      schedule: { schedule_id: 's', recurrence: 'daily', start_at: '2026-10-12T06:00', timezone: 'Asia/Seoul', days_of_week: [], window_minutes: 60 },
      announcements: [{ announcement_id: 'x', clip_id: 'c', text: null, volume: 100, at: '05:30', repeat_every_min: null, until: null }],
    })
    expect(codes(m)).toContain('timedOutsideWindow')
  })
  it('old missions without the new fields check cleanly', () => {
    expect(validateMission(clear(), ctx).status).toBe('valid')
  })
  it('video clip time counts toward the estimate', () => {
    const e = computeEstimates(mission({ waypoints: [wp('a', 0, 0, [{ type: 'video_clip', label: '', params: { seconds: 20 } }])] }))
    expect(e.duration_s).toBe(20)
  })
})

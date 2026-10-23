import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry, MissionWaypoint } from '@/types'
import { computeEstimates, DEFAULT_SPEED_MPS } from './estimates'
import { pointInPolygon, segmentPolygonDist } from './geometry'
import { addDays, weekStart, weekday } from './schedule'
import { validateMission, type CheckContext } from './validate'

const wp = (id: string, x: number, y: number, actions: MissionWaypoint['actions'] = []): MissionWaypoint =>
  ({ waypoint_id: id, label: id, x_m: x, y_m: y, z_m: null, heading_deg: null, tolerance_m: 0.5, actions, status: 'pending' })

const mission = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
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
  it('a video task whose camera is not recorded is an error', () => {
    const video = (camera?: string) => [wp('a', 0, 5, [{ type: 'video_clip' as const, label: 'Clip', params: camera ? { camera, seconds: 15 } : { seconds: 15 } }]), wp('b', 10, 5)]
    expect(codes(clear({ waypoints: video('rear'), recording: { enabled: true, cameras: ['front'] } }))).toContain('videoCameraNotRecorded')
    expect(codes(clear({ waypoints: video('front'), recording: { enabled: true, cameras: [] } }))).toContain('videoCameraNotRecorded')
    expect(codes(clear({ waypoints: video('front'), recording: { enabled: true, cameras: ['front'] } }))).not.toContain('videoCameraNotRecorded')
    // A clip without a camera param uses the front camera, like a new task.
    expect(codes(clear({ waypoints: video(), recording: { enabled: true, cameras: ['front'] } }))).not.toContain('videoCameraNotRecorded')
    const v = validateMission(clear({ waypoints: video('rear'), recording: { enabled: true, cameras: ['front'] } }), ctx)
    expect(v.status).toBe('invalid')
    expect(v.issues.find((i) => i.code === 'videoCameraNotRecorded')?.message).toMatch(/Rear/)
  })
  it('recording on with no cameras and no video tasks is a warning', () => {
    const v = validateMission(clear({ recording: { enabled: true, cameras: [] } }), ctx)
    expect(v.issues.map((i) => i.code)).toEqual(['recordingNoCameras'])
    expect(v.status).toBe('warnings')
    expect(codes(clear({ recording: { enabled: false, cameras: [] } }))).not.toContain('recordingNoCameras')
  })
  it('a timed announcement without a clip is an error', () => {
    const m = mission({ waypoints: [wp('a', 0, 5), wp('b', 10, 5)], announcements: [{ announcement_id: 'x', clip_id: '', text: null, volume: 100, at: '10:00', repeat_every_min: null, until: null }] })
    expect(codes(m)).toContain('timedNoClip')
  })
  it('old missions without the new fields check cleanly', () => {
    expect(validateMission(clear(), ctx).status).toBe('valid')
  })
  it('video clip time counts toward the estimate', () => {
    const e = computeEstimates(mission({ waypoints: [wp('a', 0, 0, [{ type: 'video_clip', label: '', params: { seconds: 20 } }])] }))
    expect(e.duration_s).toBe(20)
  })
})

describe('sample mission library', () => {
  it('has no announcement without a clip', async () => {
    const { mockMissionLibrary } = await import('@/mocks/mockMissionLibrary')
    for (const m of mockMissionLibrary) {
      expect(codes(m, { noGoZones: [], geofence: null, robotType: null })).not.toContain('announcementNoClip')
    }
  })
})

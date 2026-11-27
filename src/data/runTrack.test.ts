import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRACE_COLUMNS, type RunTrack, type TraceLeg, type TracePlan } from '@/types'
import {
  controllerSegments, figureBounds, firstPose, formatRunClock, legIndexAt, planIndexAt, positionAt, sampleIndexAt,
  speedSeries, trackDurationS, trackModel, trackTimeFromVideo, videoTimeAt, walkedRuns, walkedUpTo,
} from './runTrack'

const track = (columns: RunTrack['columns'], duration_s = 10): Pick<RunTrack, 'columns' | 'duration_s'> => ({ columns, duration_s })

// 5 Hz: t 0..1.0, a pose gap at 0.4-0.6, a controller switch and a dropped ask.
const T = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
const BASE = track({
  t: T,
  x: [0, 1, null, null, 4, 5],
  y: [0, 0, null, null, 0, 0],
  yaw: [0, 0, null, null, Math.PI, -Math.PI + 0.2],
  ask_vx: [0.2, 0.2, null, 0.3, 0.3, 0.3],
  sent_vx: [0.1, 0.2, 0.2, 0.3, 0.3, 0.3],
  meas_vx: ['0.1', '0.2', '0.2', '0.25', '0.3', '0.3'],
  meas_wz: [0, 0, 0, 0, 0.5, 0],
  controller: ['FollowPath', 'FollowPath', 'FollowPathTight', 'FollowPathTight', '', 'FollowPath'],
  fwd_dropped: [0, 0, 2, 0, 0, 1],
})

describe('trackModel', () => {
  it('parses numeric strings and blank cells', () => {
    const m = trackModel(BASE)
    expect(m.meas_vx[3]).toBe(0.25)
    expect(m.controller[4]).toBeNull()
    expect(m.x[2]).toBeNull()
  })
  it('reads a history track (some columns only) as nulls elsewhere', () => {
    const m = trackModel({ columns: { t: [0, 5], x: [1, 2], y: [1, 1] } })
    expect(m.ask_vx).toEqual([null, null])
    expect(m.controller).toEqual([null, null])
    expect(m.maxGapS).toBe(15)
  })
})

describe('positionAt', () => {
  const m = trackModel(BASE)
  it('interpolates between neighbouring samples', () => {
    expect(positionAt(m, 0.1)).toMatchObject({ x: 0.5, y: 0 })
  })
  it('is null before the first sample and inside a pose gap', () => {
    expect(positionAt(m, -1)).toBeNull()
    expect(positionAt(m, 0.5)).toBeNull()
  })
  it('holds the last known pose up to an unknown next sample', () => {
    expect(positionAt(m, 0.3)).toMatchObject({ x: 1, y: 0 })
  })
  it('turns the short way round across ±π', () => {
    const p = positionAt(m, 0.9)!
    expect(Math.abs(Math.abs(p.yaw) - (Math.PI + 0.1))).toBeLessThan(1e-9)
  })
  it('does not interpolate across a long outage', () => {
    const g = trackModel({ columns: { t: [0, 0.2, 0.4, 20], x: [0, 1, 2, 9], y: [0, 0, 0, 0] } })
    expect(positionAt(g, 10)).toBeNull()
    expect(positionAt(g, 0.5)).toMatchObject({ x: 2 })
  })
})

describe('walked line', () => {
  const m = trackModel(BASE)
  it('splits at null cells', () => {
    expect(walkedRuns(m)).toEqual([[[0, 0], [1, 0]], [[4, 0], [5, 0]]])
  })
  it('stops at the cursor, ending where the robot is', () => {
    expect(walkedUpTo(m, 0.1)).toEqual([[[0, 0], [0.5, 0]]])
    expect(walkedUpTo(m, 0.85)).toEqual([[[0, 0], [1, 0]], [[4, 0], [4.25, 0]]])
  })
  it('is empty before the first pose', () => {
    expect(walkedUpTo(m, -1)).toEqual([])
  })
})

describe('plans, legs and controller', () => {
  const plans: TracePlan[] = [{ t: 0, goal_id: '1', failed: false, points: [] }, { t: 0.5, goal_id: '1', failed: false, points: [[9, 9]] }]
  it('finds the plan current at t', () => {
    expect(planIndexAt(plans, -0.1)).toBe(-1)
    expect(planIndexAt(plans, 0.4)).toBe(0)
    expect(planIndexAt(plans, 0.5)).toBe(1)
  })
  it('finds the leg under the cursor', () => {
    const legs = [{ t_start: 0, t_end: 2 }, { t_start: 3, t_end: 5 }] as TraceLeg[]
    expect(legIndexAt(legs, 1)).toBe(0)
    expect(legIndexAt(legs, 2.5)).toBe(-1)
    expect(legIndexAt(legs, 5)).toBe(1)
  })
  it('makes one bar per run of the same controller', () => {
    expect(controllerSegments(trackModel(BASE))).toEqual([
      { t0: 0, t1: 0.4, name: 'FollowPath' },
      { t0: 0.4, t1: 0.8, name: 'FollowPathTight' },
      { t0: 1.0, t1: 1.0, name: 'FollowPath' },
    ])
  })
  it('binary-searches the sample index', () => {
    expect(sampleIndexAt(T, 0.65)).toBe(3)
    expect(sampleIndexAt(T, 99)).toBe(5)
  })
})

describe('speedSeries', () => {
  const s = speedSeries(trackModel(BASE))
  it('breaks the ask line at blank cells', () => {
    expect(s.ask).toEqual([[[0, 0.2], [0.2, 0.2]], [[0.6, 0.3], [0.8, 0.3], [1.0, 0.3]]])
    expect(s.sent).toHaveLength(1)
  })
  it('ticks rows that dropped forward asks, and scales to the fastest line', () => {
    expect(s.dropped).toEqual([0.4, 1.0])
    expect(s.maxV).toBe(0.3)
    expect(s.maxW).toBe(0.5)
  })
})

describe('formatRunClock', () => {
  it('m:ss, and h:mm:ss past an hour', () => {
    expect(formatRunClock(0)).toBe('0:00')
    expect(formatRunClock(65.7)).toBe('1:05')
    expect(formatRunClock(3725)).toBe('1:02:05')
  })
})

describe('video and extent', () => {
  it('video time is t minus the offset, null before the first frame', () => {
    expect(videoTimeAt(10, 1.5)).toBe(8.5)
    expect(videoTimeAt(1, 1.5)).toBeNull()
    expect(trackTimeFromVideo(8.5, 1.5)).toBe(10)
  })
  it('the duration covers samples past the recorded end', () => {
    expect(trackDurationS({ duration_s: 0.5 }, trackModel(BASE))).toBe(1)
    expect(trackDurationS({ duration_s: 30 }, trackModel(BASE))).toBe(30)
  })
  it('frames route, plans and walk plus a metre', () => {
    const m = trackModel(BASE)
    expect(firstPose(m)).toMatchObject({ x: 0, y: 0 })
    expect(figureBounds(m, [{ t: 0, goal_id: null, failed: false, points: [[2, 3]] }], [{ x_m: -2, y_m: 1 }]))
      .toEqual([[-1, -3], [4, 6]])
    expect(figureBounds(trackModel({ columns: {} }), [], [])).toBeNull()
  })
})

// The column list is the contract with the bridge writer and the backend.
const PY = path.resolve(__dirname, '../../../shared/schemas/run_trace.py')
describe.skipIf(!existsSync(PY))('mirrors shared/schemas/run_trace.py', () => {
  const src = existsSync(PY) ? readFileSync(PY, 'utf8') : ''
  it('TRACE_COLUMNS', () => {
    const start = src.indexOf('TRACE_COLUMNS: Tuple')
    const block = src.slice(src.indexOf('(', start + 30), src.indexOf('\n)', start))
    const names = [...block.replace(/#.*$/gm, '').matchAll(/"([a-z_]+)"/g)].map((x) => x[1])
    expect(names).toEqual([...TRACE_COLUMNS])
  })
  const fields = (cls: string) => {
    const start = src.indexOf(`class ${cls}(`)
    const body = src.slice(start).split('\n').slice(1)
    const out: string[] = []
    for (const line of body) {
      if (/^\S/.test(line)) break
      const f = /^ {4}([a-z_]+):/.exec(line)
      if (f) out.push(f[1])
    }
    return out.sort()
  }
  it('TracePlan and TraceLeg fields', () => {
    const plan: TracePlan = { t: 0, goal_id: null, failed: false, points: [] }
    const leg: TraceLeg = {
      t_start: 0, t_end: 0, goal_id: null, waypoint_id: null, outcome: null, duration_s: 0, walked_m: 0,
      first_plan_m: null, straight_m: null, heading_change_deg_per_m: null, turn_in_place_s: 0, tight_s: null,
      plans: 0, route_changes: 0, line: '',
    }
    expect(Object.keys(plan).sort()).toEqual(fields('TracePlan'))
    expect(Object.keys(leg).sort()).toEqual(fields('TraceLeg'))
  })
})

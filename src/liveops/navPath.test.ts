import { describe, expect, it } from 'vitest'
import '@/i18n'
import { MAX_NAV_PATH_POINTS } from '@/types/navPath'
import {
  NAV_PATH_STALE_MS, currentNavPath, drawableNavPath, navPathHint, parseNavPathFrame, trimPathToRobot, type NavPathSample,
} from './navPath'

const raw = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', map_id: 'map-office', goal_id: 'goal-1',
  captured_at: '2026-11-17T05:00:00Z', points: [[0, 0], [1, 1], [2, 1]], length_m: 2.41, planning_failed: false, ...over,
})
const sample = (over: Record<string, unknown> = {}, receivedAt = 1_000): NavPathSample =>
  ({ frame: parseNavPathFrame(raw(over))!, receivedAt })
const goal = { goal_id: 'goal-1' }

describe('parseNavPathFrame', () => {
  it('reads a whole frame', () => {
    expect(parseNavPathFrame(raw())).toEqual(raw())
  })

  it('fills the schema defaults: no points, no length, not failed', () => {
    const { points: _p, length_m: _l, planning_failed: _f, ...bare } = raw()
    expect(parseNavPathFrame(bare)).toMatchObject({ points: [], length_m: null, planning_failed: false })
  })

  it('refuses the whole frame when anything is off', () => {
    for (const bad of [
      null, 'x', [], raw({ goal_id: '' }), raw({ goal_id: undefined }), raw({ robot_id: 3 }), raw({ map_id: '' }),
      raw({ points: [[0, Number.NaN]] }), raw({ points: [[0, 1, 2]] }), raw({ points: 'x' }),
      raw({ points: Array.from({ length: MAX_NAV_PATH_POINTS + 1 }, (_, i) => [i, 0]) }),
      raw({ length_m: -1 }), raw({ length_m: Number.POSITIVE_INFINITY }), raw({ length_m: '2' }),
      raw({ planning_failed: 'yes' }),
    ]) {
      expect(parseNavPathFrame(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('takes exactly MAX_NAV_PATH_POINTS points', () => {
    const points = Array.from({ length: MAX_NAV_PATH_POINTS }, (_, i) => [i, 0])
    expect(parseNavPathFrame(raw({ points }))?.points).toHaveLength(MAX_NAV_PATH_POINTS)
  })
})

describe('currentNavPath', () => {
  it('is the frame for the active goal on the map shown, while fresh', () => {
    expect(currentNavPath(sample(), goal, 'map-office', 1_000 + NAV_PATH_STALE_MS - 1))
      .toEqual({ points: [[0, 0], [1, 1], [2, 1]], failed: false, lengthM: 2.41 })
  })

  it('falls back (null) when stale, ended, for another goal or for another map', () => {
    expect(currentNavPath(sample(), goal, 'map-office', 1_000 + NAV_PATH_STALE_MS)).toBeNull()
    expect(currentNavPath(sample(), null, 'map-office', 1_000)).toBeNull()
    expect(currentNavPath(sample(), { goal_id: 'goal-2' }, 'map-office', 1_000)).toBeNull()
    expect(currentNavPath(sample(), goal, 'map-lab', 1_000)).toBeNull()
    expect(currentNavPath(sample(), goal, undefined, 1_000)).toBeNull()
    expect(currentNavPath(null, goal, 'map-office', 1_000)).toBeNull()
    // The bridge's "goal ended" frame: same goal, no points.
    expect(currentNavPath(sample({ points: [] }), goal, 'map-office', 1_000)).toBeNull()
  })

  it('keeps a failed frame with no points, so the hint can say there is no route', () => {
    const view = currentNavPath(sample({ points: [], planning_failed: true }), goal, 'map-office', 1_000)
    expect(view).toEqual({ points: [], failed: true, lengthM: 2.41 })
    expect(drawableNavPath(view)).toBe(false)
  })
})

describe('trimPathToRobot', () => {
  const path: [number, number][] = [[0, 0], [4, 0], [4, 4]]

  it('drops the part behind the robot: the line starts at the nearest point on the path', () => {
    expect(trimPathToRobot(path, [1.5, 0.3])).toEqual([[1.5, 0], [4, 0], [4, 4]])
    expect(trimPathToRobot(path, [4.2, 2])).toEqual([[4, 2], [4, 4]])
  })

  it('starts at the path’s first point when the robot is behind it', () => {
    expect(trimPathToRobot(path, [-1, 0])).toEqual([[0, 0], [4, 0], [4, 4]])
  })

  it('leaves a path of fewer than two points as it is', () => {
    expect(trimPathToRobot([[1, 1]], [0, 0])).toEqual([[1, 1]])
    expect(trimPathToRobot([], [0, 0])).toEqual([])
  })

  it('copes with repeated points', () => {
    expect(trimPathToRobot([[0, 0], [0, 0], [2, 0]], [1, 1])).toEqual([[1, 0], [2, 0]])
  })
})

describe('navPathHint', () => {
  it('says nothing while the planner is fine, or with no path', () => {
    expect(navPathHint(null)).toBeNull()
    expect(navPathHint({ points: [[0, 0], [1, 0]], failed: false, lengthM: 1 })).toBeNull()
  })

  it('is amber, worded by whether there is an earlier route to follow', () => {
    expect(navPathHint({ points: [[0, 0], [1, 0]], failed: true, lengthM: 1 }))
      .toEqual({ tone: 'amber', text: 'Nav2 can’t find a route from here — following the last one' })
    expect(navPathHint({ points: [], failed: true, lengthM: null }))
      .toEqual({ tone: 'amber', text: 'Nav2 can’t find a route to this goal' })
  })
})

import { describe, expect, it } from 'vitest'
import type { RobotRunView } from './robotRun'
import { routeRunMission } from './routeProgress'

const waypoints = ['a', 'b', 'c', 'd'].map((id, i) => ({ waypoint_id: id, label: `Gate ${id}`, x_m: i * 5, y_m: 0 }))
const view = (over: Partial<NonNullable<RobotRunView>> = {}): NonNullable<RobotRunView> => ({
  phase: 'running', runId: 'run-1', missionName: 'Perimeter', stepLabel: 'Gate b', blockId: 'wp:b:go',
  redoStepLabel: null, startedAt: '2026-11-11T00:00:00Z', owner: 'mission:run-1', youHoldControl: false, estimateS: null,
  waypointId: 'b', arrived: ['a'], route: { mapId: 'map-a', waypoints }, ...over,
})
const statuses = (v: RobotRunView) => routeRunMission(v, 'r1')?.waypoints.map((w) => w.status)

describe('routeRunMission', () => {
  it('marks the waypoints before the active one done, the active one active, the rest pending', () => {
    expect(statuses(view())).toEqual(['done', 'active', 'pending', 'pending'])
    const m = routeRunMission(view(), 'r1')!
    expect(m).toMatchObject({ robot_id: 'r1', map_id: 'map-a', name: 'Perimeter', current_waypoint_index: 1, status: 'active' })
  })

  it('marks the active waypoint done once the robot has arrived there (acting at it)', () => {
    expect(statuses(view({ arrived: ['a', 'b'] }))).toEqual(['done', 'done', 'pending', 'pending'])
  })

  it('reads arrivals alone when the bridge has not named a waypoint yet', () => {
    expect(statuses(view({ waypointId: null, arrived: [] }))).toEqual(['active', 'pending', 'pending', 'pending'])
    expect(statuses(view({ waypointId: null, arrived: ['a', 'b'] }))).toEqual(['done', 'done', 'active', 'pending'])
  })

  it('shows a paused run where it stopped', () => {
    expect(statuses(view({ phase: 'paused', pausedFor: 'blocked', waypointId: 'c', arrived: ['a', 'b'] }))).toEqual(['done', 'done', 'active', 'pending'])
  })

  it('shows every waypoint done when the run completed', () => {
    const ended = { result: 'completed' as const, reason: null, endedAt: '2026-11-11T00:05:00Z', stepsDone: 4 }
    expect(statuses(view({ phase: 'ended', ended, waypointId: null, arrived: ['a', 'b', 'c', 'd'] }))).toEqual(['done', 'done', 'done', 'done'])
  })

  it('is nothing for a program run, an unknown route, or no run', () => {
    expect(routeRunMission(view({ route: null }), 'r1')).toBeNull()
    expect(routeRunMission(view({ route: undefined }), 'r1')).toBeNull()
    expect(routeRunMission(null, 'r1')).toBeNull()
  })
})

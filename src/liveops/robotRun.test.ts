import { describe, expect, it } from 'vitest'
import type { ActiveRun, RunEvent } from '@/types'
import { initialRobotRun, reduceRobotRun, robotRunView, type RobotRunState } from './robotRun'

const ME = 'operator-dev'
const run = (over: Partial<ActiveRun> = {}): ActiveRun => ({
  run_id: 'r1', status: 'running', step_label: 'Walk 2 m', block_id: 'b1',
  started_at: '2026-10-30T01:00:00Z', redo_step_label: null, ...over,
})
const ev = (over: Partial<RunEvent>): RunEvent => ({
  run_id: 'r1', seq: 1, at: '2026-10-30T01:05:00Z', kind: 'step_done', waypoint_id: null,
  task_index: null, actor: null, media: null, position: null, detection: null, message: null,
  block_id: null, result: null, reason: null, snapshot_id: null, ...over,
})
const apply = (s: RobotRunState, input: Parameters<typeof reduceRobotRun>[1]) => reduceRobotRun(s, input, ME)
const st = (active_run: ActiveRun | null, control_owner: string | null = ME) => ({ active_run, control_owner })

describe('reduceRobotRun', () => {
  it('test_running_from_active_run', () => {
    const v = robotRunView(apply(initialRobotRun, { state: st(run()) }), ME)
    expect(v).toMatchObject({ phase: 'running', runId: 'r1', stepLabel: 'Walk 2 m', blockId: 'b1',
      startedAt: '2026-10-30T01:00:00Z', missionName: null, estimateS: null, youHoldControl: true })
  })

  it('test_paused_shows_redo_label_and_owner', () => {
    const v = robotRunView(apply(initialRobotRun,
      { state: st(run({ status: 'paused', redo_step_label: 'Walk 2 m' }), 'someone-else') }), ME)
    expect(v).toMatchObject({ phase: 'paused', redoStepLabel: 'Walk 2 m', owner: 'someone-else', youHoldControl: false })
  })

  it('test_useRobotRun_rebuilds_from_state_alone', () => {
    const s = apply(initialRobotRun, { state: st(run({ step_label: 'Turn left' })) })
    const withName = apply(s, { mission: { name: 'Patrol', estimateS: 90 } })
    expect(robotRunView(withName, ME)).toMatchObject({ phase: 'running', stepLabel: 'Turn left', missionName: 'Patrol', estimateS: 90 })
  })

  it('test_paused_with_no_owner_offers_take_control_and_stop', () => {
    const v = robotRunView(apply(initialRobotRun, { state: st(run({ status: 'paused' }), null) }), ME)
    expect(v?.phase).toBe('paused')
    expect(v?.owner).toBeNull()
    expect(v?.youHoldControl).toBe(false)
  })

  it('test_run_ended_event_gives_ended_with_result_reason_and_steps_done', () => {
    let s = apply(initialRobotRun, { state: st(run()) })
    s = apply(s, { event: ev({ kind: 'step_done', seq: 2 }) })
    s = apply(s, { event: ev({ kind: 'step_done', seq: 3 }) })
    s = apply(s, { event: ev({ kind: 'run_ended', seq: 4, result: 'aborted', reason: 'timeLimit', at: '2026-10-30T01:09:00Z' }) })
    s = apply(s, { state: st(null, null) })
    expect(robotRunView(s, ME)).toMatchObject({ phase: 'ended', runId: 'r1',
      ended: { result: 'aborted', reason: 'timeLimit', endedAt: '2026-10-30T01:09:00Z', stepsDone: 2 } })
  })

  it('test_no_ended_slot_without_a_seen_run_ended', () => {
    let s = apply(initialRobotRun, { state: st(run()) })
    s = apply(s, { state: st(null, null) })
    expect(robotRunView(s, ME)).toBeNull()
  })

  it('test_ended_cleared_by_next_run_or_dismiss', () => {
    let s = apply(initialRobotRun, { state: st(run()) })
    s = apply(s, { event: ev({ kind: 'run_ended', result: 'completed' }) })
    s = apply(s, { state: st(null, null) })
    expect(robotRunView(s, ME)?.phase).toBe('ended')
    expect(robotRunView(apply(s, { dismiss: true }), ME)).toBeNull()
    const next = apply(s, { state: st(run({ run_id: 'r2' })) })
    expect(robotRunView(next, ME)).toMatchObject({ phase: 'running', runId: 'r2' })
    expect(robotRunView(next, ME)?.ended).toBeUndefined()
  })

  it('test_events_for_another_run_are_ignored', () => {
    let s = apply(initialRobotRun, { state: st(run()) })
    s = apply(s, { event: ev({ run_id: 'other', kind: 'step_done' }) })
    s = apply(s, { event: ev({ run_id: 'other', kind: 'run_ended', result: 'failed' }) })
    expect(robotRunView(s, ME)).toMatchObject({ phase: 'running', runId: 'r1' })
    s = apply(s, { event: ev({ kind: 'run_ended', result: 'completed' }) })
    expect(robotRunView(s, ME)?.ended?.stepsDone).toBe(0)
  })

  it('test_reset_clears_the_previous_robots_run', () => {
    let s = apply(initialRobotRun, { state: st(run()) })
    s = apply(s, { mission: { name: 'Patrol', estimateS: 5 } })
    s = apply(s, { event: ev({ kind: 'step_done' }) })
    s = apply(s, { event: ev({ kind: 'run_ended', seq: 9, result: 'completed' }) })
    s = apply(s, { reset: true })
    expect(s).toEqual(initialRobotRun)
    expect(robotRunView(apply(s, { state: st(null, null) }), ME)).toBeNull()
  })

  it('test_redelivered_step_done_is_not_double_counted', () => {
    let s = apply(initialRobotRun, { state: st(run()) })
    s = apply(s, { event: ev({ kind: 'step_done', seq: 2 }) })
    s = apply(s, { event: ev({ kind: 'step_done', seq: 2 }) })
    expect(s.stepsDone).toBe(1)
  })

  it('test_unchanged_state_returns_the_same_object', () => {
    const a = apply(initialRobotRun, { state: st(run()) })
    expect(apply(a, { state: st(run()) })).toBe(a)
    const idle = apply(initialRobotRun, { state: st(null, null) })
    expect(apply(idle, { state: st(null, null) })).toBe(idle)
  })
})

describe('route runs (schema 0.0.16)', () => {
  it('reads the waypoint and a blocked pause from active_run', () => {
    const v = robotRunView(apply(initialRobotRun, {
      state: st(run({ status: 'paused', waypoint_id: 'w2', step_kind: 'navigate', paused_for: 'blocked', pause_reason: 'scan_stale: lidar' }), null),
    }), ME)
    expect(v).toMatchObject({ phase: 'paused', waypointId: 'w2', pausedFor: 'blocked', pauseReason: 'scan_stale: lidar', owner: null })
  })

  it('reads an older bridge, which sends none of the new fields, as an operator pause', () => {
    const v = robotRunView(apply(initialRobotRun, { state: st(run({ status: 'paused' }), null) }), ME)
    expect(v).toMatchObject({ phase: 'paused', waypointId: null, pausedFor: 'operator', pauseReason: null })
  })

  it('follows the waypoint as the run moves on', () => {
    let s = apply(initialRobotRun, { state: st(run({ waypoint_id: 'w1' }), 'mission:r1') })
    s = apply(s, { state: st(run({ waypoint_id: 'w2' }), 'mission:r1') })
    expect(robotRunView(s, ME)?.waypointId).toBe('w2')
  })

  it('collects arrivals once each, for this run only', () => {
    let s = apply(initialRobotRun, { state: st(run(), 'mission:r1') })
    s = apply(s, { event: ev({ kind: 'arrived', seq: 3, waypoint_id: 'w1' }) })
    s = apply(s, { event: ev({ kind: 'arrived', seq: 3, waypoint_id: 'w1' }) }) // a QoS 1 redelivery
    s = apply(s, { event: ev({ kind: 'arrived', seq: 6, waypoint_id: 'w2' }) })
    s = apply(s, { event: ev({ kind: 'arrived', seq: 7, waypoint_id: 'w9', run_id: 'other' }) })
    expect(robotRunView(s, ME)?.arrived).toEqual(['w1', 'w2'])
  })

  it("keeps the route's waypoints with the mission's name", () => {
    const waypoints = [{ waypoint_id: 'w1', label: 'Gate A', x_m: 0, y_m: 0 }]
    let s = apply(initialRobotRun, { state: st(run(), 'mission:r1') })
    s = apply(s, { mission: { name: 'Perimeter', estimateS: null, kind: 'route', mapId: 'map-a', waypoints } })
    expect(robotRunView(s, ME)).toMatchObject({ missionName: 'Perimeter', route: { mapId: 'map-a', waypoints } })
  })
})

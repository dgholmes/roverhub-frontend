import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import { OPERATOR_ID } from '@/lib/realtime/operator'
import type { RobotState } from '@/types'
import type { RobotRunView } from './robotRun'
import { formatClock, taskBarModel } from './taskBar'

const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...initialRobots[1], control_owner: null, ...over })
const STARTED = '2026-10-30T01:00:00Z'
const NOW = Date.parse('2026-10-30T01:02:05Z')

const view = (over: Partial<NonNullable<RobotRunView>> = {}): NonNullable<RobotRunView> => ({
  phase: 'running', runId: 'r1', missionName: 'Night patrol', stepLabel: 'Walk 2 m', blockId: 'b1',
  redoStepLabel: null, startedAt: STARTED, owner: 'mission:r1', youHoldControl: false, estimateS: 300,
  ...over,
})

describe('taskBarModel', () => {
  it('test_no_run_and_idle_is_the_none_slot_with_take_control', () => {
    const m = taskBarModel(null, robot({ abstract_state: 'STAND' }), NOW)
    expect(m.slot).toBe('none')
    expect(m.title).toBe('No active mission')
    expect(m.buttons).toEqual(['takeControl'])
    expect(m.progress).toBeNull()
  })

  it('test_manual_control_names_the_operator_and_offers_release', () => {
    const m = taskBarModel(null, robot({ abstract_state: 'MANUAL', control_owner: OPERATOR_ID }), NOW)
    expect(m.slot).toBe('manual')
    expect(m.title).toContain(OPERATOR_ID)
    expect(m.buttons).toEqual(['release'])
  })

  it('test_manual_text_never_prints_a_mission_owner', () => {
    const m = taskBarModel(null, robot({ abstract_state: 'MANUAL', control_owner: 'mission:r9' }), NOW)
    expect(m.title).not.toContain('mission:')
  })

  it('test_running_row', () => {
    const m = taskBarModel(view(), robot({ abstract_state: 'AUTO_MISSION', control_owner: 'mission:r1' }), NOW)
    expect(m.slot).toBe('running')
    expect(m.title).toBe('Night patrol')
    expect(m.tag).toBe('Running')
    expect(m.detail).toBe('Walk 2 m')
    expect(m.progress).toEqual({ elapsedS: 125, estimateS: 300 })
    expect(m.buttons).toEqual(['takeControl', 'stopMission'])
  })

  it('test_running_without_a_mission_name_yet_still_has_a_title', () => {
    const m = taskBarModel(view({ missionName: null }), robot({ abstract_state: 'AUTO_MISSION' }), NOW)
    expect(m.title).toBe('Mission')
  })

  it('test_paused_you_hold_control_row', () => {
    const m = taskBarModel(
      view({ phase: 'paused', owner: OPERATOR_ID, youHoldControl: true, redoStepLabel: 'Walk 2 m' }),
      robot({ abstract_state: 'MANUAL', control_owner: OPERATOR_ID }), NOW)
    expect(m.slot).toBe('paused')
    expect(m.tag).toBe('Paused · you have control')
    expect(m.detail).toBe('Will redo “Walk 2 m” when you release')
    expect(m.buttons).toEqual(['releaseResume', 'stopMission'])
    expect(m.buttons).not.toContain('release')
  })

  it('test_paused_you_hold_control_with_nothing_to_redo', () => {
    const m = taskBarModel(view({ phase: 'paused', owner: OPERATOR_ID, youHoldControl: true }),
      robot({ abstract_state: 'MANUAL', control_owner: OPERATOR_ID }), NOW)
    expect(m.detail).toBe('Will continue with the next step when you release')
  })

  it('test_paused_nobody_holds_control_row', () => {
    const m = taskBarModel(view({ phase: 'paused', owner: null, redoStepLabel: 'Walk 2 m' }),
      robot({ abstract_state: 'STAND', control_owner: null }), NOW)
    expect(m.slot).toBe('paused')
    expect(m.tag).toBe('Paused · nobody has control')
    expect(m.buttons).toEqual(['takeControl', 'stopMission'])
    expect(m.buttons).not.toContain('releaseResume')
  })

  it('test_paused_by_another_operator_offers_only_stop', () => {
    const m = taskBarModel(view({ phase: 'paused', owner: 'operator-b' }),
      robot({ abstract_state: 'MANUAL', control_owner: 'operator-b' }), NOW)
    expect(m.tag).toBe('Paused · operator-b has control')
    expect(m.buttons).toEqual(['stopMission'])
  })

  it.each([
    ['completed', 'Completed'],
    ['aborted', 'Stopped'],
    ['failed', 'Failed'],
  ] as const)('test_ended_row_%s', (result, tag) => {
    const m = taskBarModel(
      view({ phase: 'ended', ended: { result, reason: result === 'completed' ? null : 'stopped', endedAt: '2026-10-30T01:04:10Z', stepsDone: 6 } }),
      robot({ abstract_state: 'STAND' }), NOW)
    expect(m.slot).toBe('ended')
    expect(m.tag).toBe(tag)
    expect(m.detail).toContain('6 steps done')
    expect(m.detail).toContain('4:10')
    if (result === 'completed') expect((m.detail ?? '').split(' · ')).toHaveLength(2)
    else expect(m.detail).toContain('stopped by the operator')
    expect(m.progress).toBeNull()
    expect(m.buttons).toEqual(['takeControl', 'viewRun', 'dismiss'])
  })

  it('test_ended_with_an_unknown_reason_shows_it_raw', () => {
    const m = taskBarModel(
      view({ phase: 'ended', ended: { result: 'failed', reason: 'somethingNew', endedAt: '2026-10-30T01:00:30Z', stepsDone: 1 } }),
      robot(), NOW)
    expect(m.detail).toContain('somethingNew')
    expect(m.detail).toContain('1 step done')
  })

  it('test_progress_without_estimate_has_no_bar', () => {
    const m = taskBarModel(view({ estimateS: null }), robot({ abstract_state: 'AUTO_MISSION' }), NOW)
    expect(m.progress).toEqual({ elapsedS: 125, estimateS: null })
  })
})

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(250)).toBe('4:10')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})

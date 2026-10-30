import { describe, expect, it } from 'vitest'
import type { RobotAvailability } from '@/missions/robotAvailability'
import type { ValidationIssue } from '@/types'
import { programRunMissionErrors, programRunValidation, robotFreeForRun, runBlockers } from './runBlockers'

const free: RobotAvailability = { status: 'available' }
const base = { robotId: 'r1', availability: free, controlOwner: null, youHoldControl: false, programErrors: 0, missionErrors: 0, running: false }

describe('runBlockers', () => {
  it('has none when everything is ready', () => {
    expect(runBlockers(base)).toEqual([])
  })
  it('reports every reason, in order', () => {
    expect(runBlockers({ ...base, robotId: undefined, programErrors: 1, missionErrors: 2, running: true }))
      .toEqual(['noRobot', 'programErrors', 'missionErrors', 'running'])
    expect(runBlockers({ ...base, availability: { status: 'offline' }, programErrors: 1 }))
      .toEqual(['robotUnavailable', 'programErrors'])
  })
  it('does not ask for control: the edge run takes it itself', () => {
    expect(runBlockers(base)).not.toContain('noControl')
  })
  it('test_wheel_upright_with_nobody_in_control_can_run', () => {
    // A wheel robot standing (wheel_loco) reads MANUAL, so availability says inUse.
    expect(runBlockers({ ...base, availability: { status: 'inUse' } })).toEqual([])
  })
  it('test_asks_this_operator_to_release_control_first', () => {
    expect(runBlockers({ ...base, availability: { status: 'inUse' }, controlOwner: 'operator-dev', youHoldControl: true })).toEqual(['releaseControl'])
    expect(runBlockers({ ...base, availability: { status: 'inUse' }, controlOwner: 'someone-else' })).toEqual(['robotUnavailable'])
  })
})

describe('robotFreeForRun', () => {
  it('refuses a robot someone holds control of, this operator included', () => {
    // The backend refuses to start a run while anyone holds control.
    expect(robotFreeForRun({ status: 'inUse' }, 'operator-dev')).toBe(false)
    expect(robotFreeForRun({ status: 'inUse' }, 'someone')).toBe(false)
  })
  it('accepts inUse with nobody in control (a wheel robot standing reads MANUAL)', () => {
    expect(robotFreeForRun({ status: 'inUse' }, null)).toBe(true)
  })
  it('refuses missions, offline robots and critical attention; tolerates a low battery', () => {
    expect(robotFreeForRun({ status: 'onMission' }, null)).toBe(false)
    expect(robotFreeForRun({ status: 'offline' }, null)).toBe(false)
    expect(robotFreeForRun(undefined, null)).toBe(false)
    const attention = (severity: 'critical' | 'warning', kind: 'fallen' | 'batteryLow' | 'edgeSilent'): RobotAvailability =>
      ({ status: 'attention', attention: { severity, kind, text: kind, place: 'status' } })
    expect(robotFreeForRun(attention('critical', 'fallen'), null)).toBe(false)
    expect(robotFreeForRun(attention('warning', 'edgeSilent'), null)).toBe(false)
    expect(robotFreeForRun(attention('warning', 'batteryLow'), null)).toBe(true)
  })
})

describe('programRunValidation', () => {
  const issue = (code: string, severity: ValidationIssue['severity']): ValidationIssue => ({ code, severity, message: code, waypoint_id: null })
  it('is invalid on any error, warnings on warnings only, else valid', () => {
    expect(programRunValidation([issue('programTooLong', 'warning')], [issue('stairsOnWheel', 'error')]).status).toBe('invalid')
    expect(programRunValidation([issue('programTooLong', 'warning')], []).status).toBe('warnings')
    expect(programRunValidation([], [])).toEqual({ status: 'valid', issues: [] })
  })
})

describe('programRunMissionErrors', () => {
  const issue = (code: string, severity: ValidationIssue['severity'] = 'error', waypoint_id: string | null = null): ValidationIssue =>
    ({ code, severity, message: code, waypoint_id })
  it('keeps mission-wide errors and drops route ones', () => {
    const kept = programRunMissionErrors([
      issue('noWaypoints'), issue('inNoGo', 'error', 'wp-1'),
      issue('stairsOnWheel'), issue('oneWaypoint', 'warning'),
    ])
    expect(kept.map((i) => i.code)).toEqual(['stairsOnWheel'])
  })
})

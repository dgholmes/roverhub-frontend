import { describe, expect, it } from 'vitest'
import type { RobotAvailability } from '@/missions/robotAvailability'
import type { ValidationIssue } from '@/types'
import { programRunMissionErrors, programRunValidation, robotFreeForRun, runBlockers } from './runBlockers'

const free: RobotAvailability = { status: 'available' }
const base = { robotId: 'r1', availability: free, ownsControl: true, programErrors: 0, missionErrors: 0, running: false }

describe('runBlockers', () => {
  it('has none when everything is ready', () => {
    expect(runBlockers(base)).toEqual([])
  })
  it('reports every reason, in order', () => {
    expect(runBlockers({ ...base, robotId: undefined, programErrors: 1, missionErrors: 2, running: true }))
      .toEqual(['noRobot', 'programErrors', 'missionErrors', 'running'])
    expect(runBlockers({ ...base, availability: { status: 'offline' }, ownsControl: false, programErrors: 1 }))
      .toEqual(['robotUnavailable', 'programErrors', 'noControl'])
  })
  it('asks for control when the robot is free but not held', () => {
    expect(runBlockers({ ...base, ownsControl: false })).toEqual(['noControl'])
  })
})

describe('robotFreeForRun', () => {
  it('accepts a robot in use only by this operator', () => {
    expect(robotFreeForRun({ status: 'inUse' }, true)).toBe(true)
    expect(robotFreeForRun({ status: 'inUse' }, false)).toBe(false)
  })
  it('refuses missions, offline robots and critical attention; tolerates a low battery', () => {
    expect(robotFreeForRun({ status: 'onMission' }, true)).toBe(false)
    expect(robotFreeForRun({ status: 'offline' }, true)).toBe(false)
    expect(robotFreeForRun(undefined, true)).toBe(false)
    const attention = (severity: 'critical' | 'warning', kind: 'fallen' | 'batteryLow' | 'edgeSilent'): RobotAvailability =>
      ({ status: 'attention', attention: { severity, kind, text: kind, place: 'status' } })
    expect(robotFreeForRun(attention('critical', 'fallen'), true)).toBe(false)
    expect(robotFreeForRun(attention('warning', 'edgeSilent'), true)).toBe(false)
    expect(robotFreeForRun(attention('warning', 'batteryLow'), true)).toBe(true)
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
  it('keeps mission-wide errors and drops route and schedule ones', () => {
    const kept = programRunMissionErrors([
      issue('noWaypoints'), issue('robotBooked'), issue('inNoGo', 'error', 'wp-1'),
      issue('stairsOnWheel'), issue('oneWaypoint', 'warning'),
    ])
    expect(kept.map((i) => i.code)).toEqual(['stairsOnWheel'])
  })
})

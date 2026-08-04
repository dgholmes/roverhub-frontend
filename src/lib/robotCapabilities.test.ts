import { describe, expect, it } from 'vitest'
import { capabilitiesFor, GAIT_LABELS, isCommandUnsupported, robotTypeLabel } from './robotCapabilities'

describe('robotCapabilities', () => {
  it('gives wheel robots wheel_loco as their stand state', () => {
    expect(capabilitiesFor('wheel').standState).toBe('wheel_loco')
  })

  it('gives quad robots balance_stand as their stand state', () => {
    expect(capabilitiesFor('quad').standState).toBe('balance_stand')
  })

  it('never uses ready as a stand state -- ready is a lie-down', () => {
    for (const type of ['quad', 'wheel'] as const) {
      expect(capabilitiesFor(type).standState).not.toBe('ready')
      expect(capabilitiesFor(type).safeStopState).toBe('ready')
    }
  })

  it('exposes a single velocity gait for wheel robots', () => {
    expect(capabilitiesFor('wheel').velocityGaits).toEqual(['wheel_loco'])
  })

  it('exposes two velocity gaits for quad robots', () => {
    expect(capabilitiesFor('quad').velocityGaits).toEqual(['walk', 'flying_trot'])
  })

  it('defaults gait per type', () => {
    expect(capabilitiesFor('wheel').defaultGait).toBe('wheel_loco')
    expect(capabilitiesFor('quad').defaultGait).toBe('walk')
  })

  it('never reports balance_stand or walk as valid on wheel', () => {
    const caps = capabilitiesFor('wheel')
    expect(caps.validStates).not.toContain('balance_stand')
    expect(caps.validStates).not.toContain('walk')
  })

  it('never reports wheel_loco as valid on quad', () => {
    expect(capabilitiesFor('quad').validStates).not.toContain('wheel_loco')
  })

  it('shares sit and passive states across both types', () => {
    for (const type of ['quad', 'wheel'] as const) {
      expect(capabilitiesFor(type).sitState).toBe('stand_down')
      expect(capabilitiesFor(type).passiveState).toBe('passive')
    }
  })

  it('falls back to quad for an undefined type', () => {
    expect(capabilitiesFor(undefined)).toEqual(capabilitiesFor('quad'))
  })

  it('labels every gait mode', () => {
    expect(GAIT_LABELS.walk).toBe('Walk')
    expect(GAIT_LABELS.flying_trot).toBe('Flying Trot')
    expect(GAIT_LABELS.wheel_loco).toBe('Wheel Loco')
  })
})

describe('robotTypeLabel', () => {
  it('uses the same vocabulary as Fleet > Diagnostics > Foot Type', () => {
    expect(robotTypeLabel('quad')).toBe('Point Foot')
    expect(robotTypeLabel('wheel')).toBe('Wheel Foot')
  })

  it('degrades readably when the type is not yet known', () => {
    expect(robotTypeLabel(undefined)).toBe('Unknown')
  })
})

describe('isCommandUnsupported', () => {
  it('marks balance and pose commands unsupported on wheel', () => {
    for (const cmd of ['BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE']) {
      expect(isCommandUnsupported('wheel', cmd)).toBe(true)
    }
  })

  it('allows those same commands on quad', () => {
    expect(isCommandUnsupported('quad', 'BALANCE_AXIS')).toBe(false)
  })

  it('never marks safety-critical commands unsupported', () => {
    for (const cmd of ['ESTOP', 'RESET_ESTOP', 'SET_STATE', 'VELOCITY_SEQUENCE']) {
      expect(isCommandUnsupported('wheel', cmd)).toBe(false)
    }
  })

  it('treats an unknown type as quad', () => {
    expect(isCommandUnsupported(undefined, 'BALANCE_AXIS')).toBe(false)
  })
})

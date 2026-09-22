import { describe, expect, it } from 'vitest'
import {
  confirmationTextFor,
  contextualRecoveryActionFor,
  gaitPickerModelFor,
  postureActionsFor,
  quickActionsFor,
  RECOVERY_ACTION,
} from './postureModel'

/** The exact 12 motions the real miniQuadW reported from get_motions() on
 * 2026-08-04. Using the real list rather than a convenient subset means these
 * tests fail if the filtering regresses against actual hardware. */
const WHEEL_MOTIONS = [
  'change_mode', 'climb', 'drift', 'handstand', 'kill_robot', 'line_walk',
  'passive', 'ready', 'rotation', 'stand_down', 'wheel_loco',
  'wheel_loco_velocity_seq',
]

const QUAD_MOTIONS = [
  'passive', 'ready', 'stand_down', 'balance_stand', 'walk', 'flying_trot',
  'dance0', 'wave', 'jump', 'backflip', 'change_mode', 'line_walk',
  'rotation', 'walk_velocity_seq', 'kill_robot',
]

describe('postureActionsFor', () => {
  it('sends wheel_loco for Stand on a wheel robot', () => {
    const stand = postureActionsFor('wheel').find((a) => a.label === 'Stand')
    expect(stand?.state).toBe('wheel_loco')
  })

  it('sends balance_stand for Stand on a quad robot', () => {
    const stand = postureActionsFor('quad').find((a) => a.label === 'Stand')
    expect(stand?.state).toBe('balance_stand')
  })

  it('never sends ready for Stand -- ready is a lie-down, not a stand', () => {
    for (const type of ['quad', 'wheel'] as const) {
      expect(postureActionsFor(type).find((a) => a.label === 'Stand')?.state).not.toBe('ready')
    }
  })

  it('sends stand_down for Sit on both types', () => {
    for (const type of ['quad', 'wheel'] as const) {
      expect(postureActionsFor(type).find((a) => a.label === 'Sit')?.state).toBe('stand_down')
    }
  })

  it('offers Passive on both types', () => {
    for (const type of ['quad', 'wheel'] as const) {
      expect(postureActionsFor(type).find((a) => a.label === 'Passive')?.state).toBe('passive')
    }
  })

  it('requires confirmation only for Passive', () => {
    const actions = postureActionsFor('wheel')
    expect(actions.filter((a) => a.requiresConfirmation).map((a) => a.label)).toEqual(['Passive'])
  })

  it('explains what Passive does in its confirmation text', () => {
    const passive = postureActionsFor('wheel').find((a) => a.label === 'Passive')
    expect(passive?.confirmation).toMatch(/de-energis/i)
    expect(passive?.confirmation).toMatch(/drop/i)
  })

  it('offers exactly Stand, Sit and Passive', () => {
    expect(postureActionsFor('wheel').map((a) => a.label)).toEqual(['Stand', 'Sit', 'Passive'])
  })
})

describe('gaitPickerModelFor', () => {
  it('renders a toggle group for quad robots', () => {
    const model = gaitPickerModelFor({ robot_type: 'quad', gait: 'walk' })
    expect(model.kind).toBe('toggle')
    expect(model.options.map((o) => o.label)).toEqual(['Walk', 'Flying Trot'])
  })

  it('marks the robot current gait active', () => {
    const model = gaitPickerModelFor({ robot_type: 'quad', gait: 'flying_trot' })
    expect(model.options.find((o) => o.active)?.gait).toBe('flying_trot')
  })

  it('renders a static label for wheel robots, which have only one gait', () => {
    const model = gaitPickerModelFor({ robot_type: 'wheel', gait: 'wheel_loco' })
    expect(model.kind).toBe('static')
    expect(model.options).toHaveLength(1)
    expect(model.options[0].label).toBe('Wheel Loco')
  })

  it('never offers a quad gait to a wheel robot', () => {
    const model = gaitPickerModelFor({ robot_type: 'wheel', gait: 'wheel_loco' })
    expect(model.options.map((o) => o.gait)).not.toContain('walk')
  })
})

describe('quickActionsFor', () => {
  it('offers drift, climb and handstand on a wheel robot', () => {
    const ids = quickActionsFor({ available_motions: WHEEL_MOTIONS }).map((a) => a.id)
    expect(ids).toContain('drift')
    expect(ids).toContain('climb')
    expect(ids).toContain('handstand')
  })

  it('labels the wheel motions readably', () => {
    const actions = quickActionsFor({ available_motions: WHEEL_MOTIONS })
    expect(actions.find((a) => a.id === 'drift')?.label).toBe('Drift')
    expect(actions.find((a) => a.id === 'handstand')?.label).toBe('Handstand')
  })

  it('never offers kill_robot', () => {
    for (const motions of [WHEEL_MOTIONS, QUAD_MOTIONS]) {
      expect(quickActionsFor({ available_motions: motions }).map((a) => a.id)).not.toContain('kill_robot')
    }
  })

  it('never offers the velocity-sequence motions -- those are driven by the drive overlay', () => {
    const wheelIds = quickActionsFor({ available_motions: WHEEL_MOTIONS }).map((a) => a.id)
    expect(wheelIds).not.toContain('wheel_loco_velocity_seq')
    expect(wheelIds).not.toContain('wheel_loco')
    const quadIds = quickActionsFor({ available_motions: QUAD_MOTIONS }).map((a) => a.id)
    expect(quadIds).not.toContain('walk_velocity_seq')
    expect(quadIds).not.toContain('walk')
  })

  it('never offers postures or fine movement -- those have dedicated UI', () => {
    const ids = quickActionsFor({ available_motions: WHEEL_MOTIONS }).map((a) => a.id)
    for (const excluded of ['passive', 'ready', 'stand_down', 'line_walk', 'rotation', 'change_mode']) {
      expect(ids).not.toContain(excluded)
    }
  })

  it('leaves a wheel robot with exactly its three canned motions', () => {
    expect(quickActionsFor({ available_motions: WHEEL_MOTIONS }).map((a) => a.id).sort())
      .toEqual(['climb', 'drift', 'handstand'])
  })

  it('still offers the quad gestures', () => {
    const ids = quickActionsFor({ available_motions: QUAD_MOTIONS }).map((a) => a.id)
    expect(ids).toContain('backflip')
    expect(ids).toContain('wave')
    expect(ids).toContain('jump')
  })

  it('requires confirmation for handstand and climb but not drift', () => {
    const actions = quickActionsFor({ available_motions: WHEEL_MOTIONS })
    expect(actions.find((a) => a.id === 'handstand')?.requiresConfirmation).toBe(true)
    expect(actions.find((a) => a.id === 'climb')?.requiresConfirmation).toBe(true)
    expect(actions.find((a) => a.id === 'drift')?.requiresConfirmation).toBe(false)
  })

  it('surfaces an unknown future motion rather than hiding it', () => {
    const actions = quickActionsFor({ available_motions: ['some_new_trick'] })
    expect(actions).toEqual([
      { id: 'some_new_trick', label: 'Some New Trick', requiresConfirmation: false },
    ])
  })

  it('handles a robot with no reported motions', () => {
    expect(quickActionsFor({ available_motions: [] })).toEqual([])
  })

  it('labels choreo as Bow, matching the controller and Dobot v1.2.0', () => {
    const actions = quickActionsFor({ available_motions: ['choreo'] })
    expect(actions[0].label).toBe('Bow')
  })

  it('keeps recovery out of quick actions -- it has dedicated UI', () => {
    const actions = quickActionsFor({ available_motions: ['recovery', 'wave'] })
    expect(actions.map((a) => a.id)).toEqual(['wave'])
  })
})

describe('confirmationTextFor', () => {
  it('explains handstand and climb specifically', () => {
    const actions = quickActionsFor({ available_motions: WHEEL_MOTIONS })
    const handstand = actions.find((a) => a.id === 'handstand')!
    const climb = actions.find((a) => a.id === 'climb')!
    expect(confirmationTextFor(handstand)).toMatch(/inverts/i)
    expect(confirmationTextFor(climb)).toMatch(/obstacle/i)
  })

  it('returns nothing for a motion that needs no confirmation', () => {
    const drift = quickActionsFor({ available_motions: WHEEL_MOTIONS }).find((a) => a.id === 'drift')!
    expect(confirmationTextFor(drift)).toBe('')
  })
})

describe('contextualRecoveryActionFor', () => {
  it('offers Get Up when the robot is fallen', () => {
    expect(contextualRecoveryActionFor({ posture: 'fallen' })?.label).toBe('Get Up')
  })

  it('offers nothing when upright', () => {
    expect(contextualRecoveryActionFor({ posture: 'upright' })).toBeNull()
  })

  it('offers nothing when posture is unknown', () => {
    // Not an oversight: with no IMU we must not imply the robot has fallen.
    // The permanent Diagnostics control is the route in this case.
    expect(contextualRecoveryActionFor({ posture: 'unknown' })).toBeNull()
  })

  it('dispatches the SDK recovery state', () => {
    expect(RECOVERY_ACTION.state).toBe('recovery')
  })

  it('does not require confirmation -- a fallen robot needs one tap', () => {
    expect(RECOVERY_ACTION.requiresConfirmation).toBe(false)
  })
})

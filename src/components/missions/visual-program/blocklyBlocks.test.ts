import { describe, expect, it } from 'vitest'
import { BLOCK_SPECS } from './blockSpecs'

const LISTED = [
  'rh_repeat', 'rh_wait', 'rh_repeat_until', 'rh_wait_until', 'rh_if',
  'rh_cond_battery_below', 'rh_cond_fallen', 'rh_cond_standing', 'rh_cond_avoidance_on',
  'rh_move', 'rh_set_speed', 'rh_rotate', 'rh_rotate_turns', 'rh_move_towards', 'rh_avoidance',
  'rh_pose', 'rh_trick', 'rh_mode', 'rh_switch_layout',
  'rh_lights', 'rh_speak', 'rh_stop_sound', 'rh_snapshot', 'rh_start', 'rh_led',
]

describe('BLOCK_SPECS', () => {
  it('has an entry for every block type', () => {
    for (const t of LISTED) expect(BLOCK_SPECS[t], t).toBeDefined()
  })

  it('carries the limits', () => {
    expect(BLOCK_SPECS.rh_move.numberFields?.DISTANCE).toEqual([0.1, 3])
    expect(BLOCK_SPECS.rh_set_speed.numberFields?.SPEED).toEqual([10, 100])
    expect(BLOCK_SPECS.rh_rotate.numberFields?.ANGLE).toEqual([1, 360])
    expect(BLOCK_SPECS.rh_rotate_turns.numberFields?.TURNS).toEqual([1, 10])
    expect(BLOCK_SPECS.rh_repeat.numberFields?.TIMES).toEqual([1, 100])
    expect(BLOCK_SPECS.rh_wait.numberFields?.SECONDS).toEqual([0, 240])
    expect(BLOCK_SPECS.rh_cond_battery_below.numberFields?.PCT).toEqual([0, 100])
    expect(BLOCK_SPECS.rh_pose.numberFields).toEqual({
      DURATION: [0.5, 10], ROLL: [-30, 30], PITCH: [-30, 30], YAW: [-30, 30], HEIGHT: [-0.1, 0.1],
    })
  })

  it('marks quad-only blocks', () => {
    expect(BLOCK_SPECS.rh_pose.quadOnly).toBe(true)
    expect(BLOCK_SPECS.rh_trick.quadOnly).toBe(true)
    for (const t of ['rh_move', 'rh_rotate', 'rh_set_speed', 'rh_rotate_turns']) {
      expect(BLOCK_SPECS[t].quadOnly).toBeFalsy()
    }
  })
})

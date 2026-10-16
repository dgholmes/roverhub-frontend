/**
 * Pure table of the program blocks: category, robot-type restriction and the
 * numeric limits. Kept free of Blockly so the block definitions, the program
 * checks and the node tests can all read the same numbers.
 */
export type BlockCategory = 'logic' | 'motion' | 'actions' | 'mode' | 'multimedia' | 'start'

export interface BlockSpec {
  category: BlockCategory
  quadOnly?: boolean
  numberFields?: Record<string, [min: number, max: number]>
}

export const BLOCK_COLOURS: Record<BlockCategory, string> = {
  logic: '#E6A82C',
  motion: '#F0812A',
  actions: '#1E5CD3',
  mode: '#4B4BB8',
  multimedia: '#7A46D1',
  start: '#30D158',
}

export const BLOCK_SPECS: Record<string, BlockSpec> = {
  rh_start: { category: 'start' },

  rh_repeat: { category: 'logic', numberFields: { TIMES: [1, 100] } },
  // Capped well under the bridge's 300 s idle power-down, which a longer wait would trigger.
  rh_wait: { category: 'logic', numberFields: { SECONDS: [0, 240] } },
  rh_repeat_until: { category: 'logic' },
  rh_wait_until: { category: 'logic' },
  rh_if: { category: 'logic' },
  rh_cond_battery_below: { category: 'logic', numberFields: { PCT: [0, 100] } },
  rh_cond_fallen: { category: 'logic' },
  rh_cond_standing: { category: 'logic' },
  rh_cond_avoidance_on: { category: 'logic' },

  rh_move: { category: 'motion', numberFields: { DISTANCE: [0.1, 3] } },
  rh_set_speed: { category: 'motion', numberFields: { SPEED: [10, 100] } },
  rh_rotate: { category: 'motion', numberFields: { ANGLE: [1, 360] } },
  rh_rotate_turns: { category: 'motion', numberFields: { TURNS: [1, 10] } },
  rh_move_towards: { category: 'motion', numberFields: { DISTANCE: [0.1, 3], HEADING: [-180, 180] } },
  rh_avoidance: { category: 'motion' },

  rh_pose: {
    category: 'actions',
    quadOnly: true,
    numberFields: { DURATION: [0.5, 10], ROLL: [-30, 30], PITCH: [-30, 30], YAW: [-30, 30], HEIGHT: [-0.1, 0.1] },
  },
  rh_trick: { category: 'actions', quadOnly: true },

  rh_mode: { category: 'mode' },
  rh_switch_layout: { category: 'mode' },

  rh_lights: { category: 'multimedia' },
  rh_speak: { category: 'multimedia' },
  rh_stop_sound: { category: 'multimedia' },
  rh_snapshot: { category: 'multimedia' },
  // Legacy: still defined so saved programs load, but not offered in the toolbox.
  rh_led: { category: 'multimedia' },
}

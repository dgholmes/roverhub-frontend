import * as Blockly from 'blockly/core'
import i18n from '@/i18n'
import { BLOCK_COLOURS, BLOCK_SPECS, type BlockCategory } from './blockSpecs'

export { BLOCK_SPECS } from './blockSpecs'

const tr = (key: string): string => (i18n.t as (k: string) => string)(`missions.blocks.${key}`)

/** FieldNumber whose min/max come from BLOCK_SPECS, the single source of limits. */
function num(type: string, field: string, value: number, precision: number) {
  const [min, max] = BLOCK_SPECS[type].numberFields![field]
  return new Blockly.FieldNumber(value, min, max, precision)
}

const dropdown = (options: string[]) => new Blockly.FieldDropdown(options.map((o) => [tr(o), o]))

type Init = (b: Blockly.Block) => void

/** Statement block (previous + next) in its category colour. */
function statement(type: string, init: Init) {
  Blockly.Blocks[type] = {
    init(this: Blockly.Block) {
      init(this)
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour(BLOCK_COLOURS[BLOCK_SPECS[type].category])
    },
  }
}

/** Boolean condition block (value output). */
function condition(type: string, init: Init) {
  Blockly.Blocks[type] = {
    init(this: Blockly.Block) {
      init(this)
      this.setOutput(true, 'Boolean')
      this.setColour(BLOCK_COLOURS[BLOCK_SPECS[type].category])
    },
  }
}

/**
 * Custom block set for RoverHub's Visual Program mission editor — Dobot-style
 * blocks in five categories (Logic, Motion, Actions, Mode, Multimedia) that
 * compile to robot commands. Field names of the original blocks (DIRECTION,
 * DISTANCE, ANGLE, SPEED, SECONDS, TEXT) are unchanged so saved programs load.
 */
export function defineBlocks() {
  // Keyed on a block added in this version so HMR re-registers the new set.
  if (Blockly.Blocks['rh_repeat']) return

  Blockly.Blocks['rh_start'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(tr('start'))
      this.setNextStatement(true, null)
      this.setColour(BLOCK_COLOURS.start)
      this.setDeletable(false)
      this.setTooltip(tr('startTooltip'))
    },
  }

  // Logic
  statement('rh_repeat', (b) => {
    b.appendDummyInput().appendField(tr('repeat')).appendField(num('rh_repeat', 'TIMES', 2, 1), 'TIMES').appendField(tr('timesUnit'))
    b.appendStatementInput('DO')
  })
  statement('rh_wait', (b) => {
    b.appendDummyInput().appendField(tr('wait')).appendField(num('rh_wait', 'SECONDS', 1, 1), 'SECONDS').appendField(tr('secondsUnit'))
  })
  statement('rh_repeat_until', (b) => {
    b.appendValueInput('COND').setCheck('Boolean').appendField(tr('repeatUntil'))
    b.appendStatementInput('DO')
  })
  statement('rh_wait_until', (b) => {
    b.appendValueInput('COND').setCheck('Boolean').appendField(tr('waitUntil'))
  })
  statement('rh_if', (b) => {
    b.appendValueInput('COND').setCheck('Boolean').appendField(tr('if'))
    b.appendStatementInput('DO').appendField(tr('then'))
    b.appendStatementInput('ELSE').appendField(tr('else'))
  })
  condition('rh_cond_battery_below', (b) => {
    b.appendDummyInput().appendField(tr('batteryBelow')).appendField(num('rh_cond_battery_below', 'PCT', 30, 1), 'PCT').appendField('%')
  })
  condition('rh_cond_fallen', (b) => { b.appendDummyInput().appendField(tr('fallen')) })
  condition('rh_cond_standing', (b) => { b.appendDummyInput().appendField(tr('standing')) })
  condition('rh_cond_avoidance_on', (b) => { b.appendDummyInput().appendField(tr('avoidanceOn')) })

  // Motion
  statement('rh_move', (b) => {
    b.appendDummyInput()
      .appendField(tr('move'))
      .appendField(dropdown(['forward', 'backward', 'left', 'right']), 'DIRECTION')
      .appendField(num('rh_move', 'DISTANCE', 1, 0.1), 'DISTANCE')
      .appendField('m')
  })
  statement('rh_set_speed', (b) => {
    b.appendDummyInput().appendField(tr('setSpeed')).appendField(num('rh_set_speed', 'SPEED', 50, 1), 'SPEED').appendField('%')
    b.setTooltip(tr('setSpeedTooltip'))
  })
  statement('rh_rotate', (b) => {
    b.appendDummyInput()
      .appendField(tr('rotate'))
      .appendField(dropdown(['left', 'right']), 'DIRECTION')
      .appendField(num('rh_rotate', 'ANGLE', 90, 1), 'ANGLE')
      .appendField('°')
  })
  statement('rh_rotate_turns', (b) => {
    b.appendDummyInput()
      .appendField(tr('rotateTurns'))
      .appendField(dropdown(['left', 'right']), 'DIRECTION')
      .appendField(num('rh_rotate_turns', 'TURNS', 1, 1), 'TURNS')
      .appendField(tr('turnsUnit'))
  })
  statement('rh_move_towards', (b) => {
    b.appendDummyInput()
      .appendField(tr('moveTowards'))
      .appendField(num('rh_move_towards', 'DISTANCE', 1, 0.1), 'DISTANCE')
      .appendField(tr('metresAtHeading'))
      .appendField(num('rh_move_towards', 'HEADING', 0, 1), 'HEADING')
      .appendField('°')
    b.setTooltip(tr('moveTowardsTooltip'))
  })
  statement('rh_avoidance', (b) => {
    b.appendDummyInput().appendField(tr('avoidance')).appendField(dropdown(['on', 'off']), 'STATE')
  })

  // Actions
  statement('rh_pose', (b) => {
    b.appendDummyInput().appendField(tr('pose')).appendField(dropdown(['dynamic', 'static']), 'MODE')
      .appendField(tr('poseFor')).appendField(num('rh_pose', 'DURATION', 2, 0.5), 'DURATION').appendField(tr('secondsUnit'))
    b.appendDummyInput().appendField(tr('roll')).appendField(num('rh_pose', 'ROLL', 0, 1), 'ROLL')
      .appendField(tr('pitch')).appendField(num('rh_pose', 'PITCH', 0, 1), 'PITCH')
      .appendField(tr('yaw')).appendField(num('rh_pose', 'YAW', 0, 1), 'YAW').appendField('°')
    b.appendDummyInput().appendField(tr('height')).appendField(num('rh_pose', 'HEIGHT', 0, 0.01), 'HEIGHT').appendField('m')
    b.setTooltip(tr('quadOnlyTooltip'))
  })
  statement('rh_trick', (b) => {
    b.appendDummyInput().appendField(tr('trick')).appendField(dropdown(['wave', 'jump', 'dance0', 'backflip', 'choreo']), 'TRICK')
    b.setTooltip(tr('quadOnlyTooltip'))
  })

  // Mode
  statement('rh_mode', (b) => {
    b.appendDummyInput().appendField(tr('mode')).appendField(dropdown(['ready', 'stand', 'trot', 'walk']), 'MODE')
  })
  statement('rh_switch_layout', (b) => {
    b.appendDummyInput().appendField(tr('switchLayout'))
    b.setTooltip(tr('switchLayoutTooltip'))
  })

  // Multimedia
  statement('rh_lights', (b) => {
    b.appendDummyInput().appendField(tr('lights')).appendField(dropdown(['front', 'rear', 'both']), 'WHICH').appendField(dropdown(['on', 'off']), 'STATE')
  })
  statement('rh_speak', (b) => {
    b.appendDummyInput().appendField(tr('speak')).appendField(new Blockly.FieldTextInput('Hello'), 'TEXT')
      .appendField(dropdown(['once', 'until']), 'UNTIL_DONE')
  })
  statement('rh_stop_sound', (b) => { b.appendDummyInput().appendField(tr('stopSound')) })
  statement('rh_snapshot', (b) => {
    b.appendDummyInput().appendField(tr('snapshot')).appendField(dropdown(['front', 'rear']), 'CAMERA')
  })
  // Legacy, kept so saved programs load; not in the toolbox.
  statement('rh_led', (b) => { b.appendDummyInput().appendField(tr('led')) })
}

const TOOLBOX_ORDER: BlockCategory[] = ['logic', 'motion', 'actions', 'mode', 'multimedia']

/** Built per inject so category names follow the current language. */
export function toolbox() {
  return {
    kind: 'categoryToolbox',
    contents: TOOLBOX_ORDER.map((category) => ({
      kind: 'category',
      name: tr(`categories.${category}`),
      colour: BLOCK_COLOURS[category],
      contents: Object.entries(BLOCK_SPECS)
        .filter(([type, spec]) => spec.category === category && type !== 'rh_led')
        .map(([type]) => ({ kind: 'block', type })),
    })),
  }
}

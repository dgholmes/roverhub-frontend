import * as Blockly from 'blockly/core'
import i18n from '@/i18n'

/**
 * Custom block set for RoverHub's Visual Program mission editor — mirrors the
 * reference app's Blockly-based mission scripting (Start/Ready/Set speed/
 * Move/Rotate blocks), scoped to what compiles cleanly to a Mission waypoint
 * list rather than a 1:1 port of every reference block.
 */
export function defineBlocks() {
  if (Blockly.Blocks['rh_start']) return // guard against re-registration on remount/HMR

  Blockly.Blocks['rh_start'] = {
    init() {
      this.appendDummyInput().appendField(i18n.t('missions.blocks.start'))
      this.setNextStatement(true, null)
      this.setColour('#AAFF00')
      this.setDeletable(false)
      this.setTooltip(i18n.t('missions.blocks.startTooltip'))
    },
  }

  Blockly.Blocks['rh_set_speed'] = {
    init() {
      this.appendDummyInput()
        .appendField(i18n.t('missions.blocks.setSpeed'))
        .appendField(new Blockly.FieldNumber(50, 10, 100, 1), 'SPEED')
        .appendField('%')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#409CFF')
      this.setTooltip(i18n.t('missions.blocks.setSpeedTooltip'))
    },
  }

  Blockly.Blocks['rh_move'] = {
    init() {
      this.appendDummyInput()
        .appendField(i18n.t('missions.blocks.move'))
        .appendField(new Blockly.FieldDropdown([[i18n.t('missions.blocks.forward'), 'forward'], [i18n.t('missions.blocks.backward'), 'backward']]), 'DIRECTION')
        .appendField(new Blockly.FieldNumber(1, 0.1, 20, 0.1), 'DISTANCE')
        .appendField('m')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#409CFF')
    },
  }

  Blockly.Blocks['rh_rotate'] = {
    init() {
      this.appendDummyInput()
        .appendField(i18n.t('missions.blocks.rotate'))
        .appendField(new Blockly.FieldDropdown([[i18n.t('missions.blocks.left'), 'left'], [i18n.t('missions.blocks.right'), 'right']]), 'DIRECTION')
        .appendField(new Blockly.FieldNumber(90, 0, 360, 1), 'ANGLE')
        .appendField('°')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#409CFF')
    },
  }

  Blockly.Blocks['rh_wait'] = {
    init() {
      this.appendDummyInput()
        .appendField(i18n.t('missions.blocks.wait'))
        .appendField(new Blockly.FieldNumber(1, 0, 60, 1), 'SECONDS')
        .appendField(i18n.t('missions.blocks.secondsUnit'))
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#8B8B90')
    },
  }

  Blockly.Blocks['rh_snapshot'] = {
    init() {
      this.appendDummyInput().appendField(i18n.t('missions.blocks.snapshot'))
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#FF9F0A')
    },
  }

  Blockly.Blocks['rh_speak'] = {
    init() {
      this.appendDummyInput().appendField(i18n.t('missions.blocks.speak')).appendField(new Blockly.FieldTextInput('Hello'), 'TEXT')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#FF9F0A')
    },
  }

  Blockly.Blocks['rh_led'] = {
    init() {
      this.appendDummyInput().appendField(i18n.t('missions.blocks.led'))
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#FF9F0A')
    },
  }
}

/** Built per inject so category names follow the current language. */
export function toolbox() {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category', name: i18n.t('missions.blocks.categories.mode'), colour: '#AAFF00',
        contents: [{ kind: 'block', type: 'rh_start' }],
      },
      {
        kind: 'category', name: i18n.t('missions.blocks.categories.motion'), colour: '#409CFF',
        contents: [
          { kind: 'block', type: 'rh_set_speed' },
          { kind: 'block', type: 'rh_move' },
          { kind: 'block', type: 'rh_rotate' },
        ],
      },
      {
        kind: 'category', name: i18n.t('missions.blocks.categories.actions'), colour: '#FF9F0A',
        contents: [
          { kind: 'block', type: 'rh_snapshot' },
          { kind: 'block', type: 'rh_speak' },
          { kind: 'block', type: 'rh_led' },
          { kind: 'block', type: 'rh_wait' },
        ],
      },
    ],
  }
}

import * as Blockly from 'blockly/core'

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
      this.appendDummyInput().appendField('Start')
      this.setNextStatement(true, null)
      this.setColour('#AAFF00')
      this.setDeletable(false)
      this.setTooltip('Entry point — every program needs exactly one.')
    },
  }

  Blockly.Blocks['rh_set_speed'] = {
    init() {
      this.appendDummyInput()
        .appendField('Set speed to')
        .appendField(new Blockly.FieldNumber(50, 10, 100, 1), 'SPEED')
        .appendField('%')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#409CFF')
      this.setTooltip('Informational only in this mock — does not affect the compiled route.')
    },
  }

  Blockly.Blocks['rh_move'] = {
    init() {
      this.appendDummyInput()
        .appendField('Move')
        .appendField(new Blockly.FieldDropdown([['forward', 'forward'], ['backward', 'backward']]), 'DIRECTION')
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
        .appendField('Rotate')
        .appendField(new Blockly.FieldDropdown([['left', 'left'], ['right', 'right']]), 'DIRECTION')
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
        .appendField('Wait')
        .appendField(new Blockly.FieldNumber(1, 0, 60, 1), 'SECONDS')
        .appendField('s')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#8B8B90')
    },
  }

  Blockly.Blocks['rh_snapshot'] = {
    init() {
      this.appendDummyInput().appendField('Take Snapshot')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#FF9F0A')
    },
  }

  Blockly.Blocks['rh_speak'] = {
    init() {
      this.appendDummyInput().appendField('Speak').appendField(new Blockly.FieldTextInput('Hello'), 'TEXT')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#FF9F0A')
    },
  }

  Blockly.Blocks['rh_led'] = {
    init() {
      this.appendDummyInput().appendField('Flash LED')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour('#FF9F0A')
    },
  }
}

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Mode', colour: '#AAFF00',
      contents: [{ kind: 'block', type: 'rh_start' }],
    },
    {
      kind: 'category', name: 'Motion', colour: '#409CFF',
      contents: [
        { kind: 'block', type: 'rh_set_speed' },
        { kind: 'block', type: 'rh_move' },
        { kind: 'block', type: 'rh_rotate' },
      ],
    },
    {
      kind: 'category', name: 'Actions', colour: '#FF9F0A',
      contents: [
        { kind: 'block', type: 'rh_snapshot' },
        { kind: 'block', type: 'rh_speak' },
        { kind: 'block', type: 'rh_led' },
        { kind: 'block', type: 'rh_wait' },
      ],
    },
  ],
}

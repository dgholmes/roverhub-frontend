import * as Blockly from 'blockly/core'
import * as BlocklyEn from 'blockly/msg/en'
import { programBlocksFrom, type BlockLike } from '@/missions/program/programBlocks'
import type { ProgramBlock } from '@/missions/program/types'
import { defineBlocks } from './blocklyBlocks'

/**
 * A saved program's blocks, read without opening the canvas: the Schedule
 * page runs a task's program from here. The saved state is loaded into a
 * headless workspace and read by the same `programBlocksFrom` the canvas uses,
 * so a program cannot run differently from where it was run than from where it
 * was written. Null when the mission has no program or it cannot be read.
 */
export function savedProgramBlocks(state: string | null | undefined): ProgramBlock[] | null {
  if (!state) return null
  // Some fields read Blockly.Msg as they are built; the canvas sets a locale
  // when it opens, and this may run before it ever has.
  if (!Blockly.Msg['UNDO']) Blockly.setLocale(BlocklyEn as unknown as { [key: string]: string })
  defineBlocks()
  const workspace = new Blockly.Workspace()
  Blockly.Events.disable()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(state), workspace)
    const start = workspace.getBlocksByType('rh_start', false)[0] ?? null
    if (!start) return null
    return programBlocksFrom(start as unknown as BlockLike).blocks
  } catch {
    return null
  } finally {
    Blockly.Events.enable()
    workspace.dispose()
  }
}

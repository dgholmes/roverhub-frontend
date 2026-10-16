import type { ProgramBlock } from './types'

/** Blockly's `inputTypes` values (blockly/core/inputs/input_types), copied so
 * this file needs no Blockly and runs in the node tests. */
export const INPUT_VALUE = 1
export const INPUT_STATEMENT = 3

/** The slice of a Blockly block the tree builder reads. A real `Blockly.Block`
 * satisfies it. */
export interface BlockLike {
  id: string
  type: string
  inputList: ReadonlyArray<{
    name: string
    type: number
    fieldRow: ReadonlyArray<{ name?: string; getValue(): unknown }>
  }>
  getNextBlock(): BlockLike | null
  getInputTargetBlock(name: string): BlockLike | null
  /** The block's own disabled state; a disabled parent's children are treated as disabled here. */
  isEnabled(): boolean
}

function fieldsOf(b: BlockLike): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const input of b.inputList) {
    for (const f of input.fieldRow) {
      if (!f.name) continue
      const v = f.getValue()
      out[f.name] = typeof v === 'number' ? v : String(v)
    }
  }
  return out
}

/**
 * The program as plain data: the chain after the Start block, each block with
 * its fields and, for C-shaped and condition blocks, what is plugged into its
 * statement (DO, ELSE) and value (COND) inputs. A disabled block is left out
 * with everything inside it (as Blockly treats a disabled block's children),
 * and the chain carries on after it. `visited` counts every block reached,
 * disabled ones included, so the caller can tell how many on the canvas are
 * not connected.
 */
export function programBlocksFrom(start: BlockLike | null): { blocks: ProgramBlock[]; visited: number } {
  let visited = 0
  const one = (b: BlockLike, off: boolean): ProgramBlock => {
    visited++
    const inputs: ProgramBlock['inputs'] = {}
    for (const input of b.inputList) {
      if (!input.name) continue
      if (input.type === INPUT_STATEMENT) inputs[input.name] = chain(b.getInputTargetBlock(input.name), off)
      else if (input.type === INPUT_VALUE) {
        const target = b.getInputTargetBlock(input.name)
        const targetOff = off || (target ? !target.isEnabled() : false)
        const block = target ? one(target, targetOff) : null
        inputs[input.name] = block && !targetOff ? block : null
      }
    }
    return { id: b.id, type: b.type, fields: fieldsOf(b), inputs }
  }
  const chain = (first: BlockLike | null, parentOff: boolean): ProgramBlock[] => {
    const out: ProgramBlock[] = []
    for (let b = first; b; b = b.getNextBlock()) {
      const off = parentOff || !b.isEnabled()
      const block = one(b, off)
      if (!off) out.push(block)
    }
    return out
  }
  if (!start) return { blocks: [], visited: 0 }
  visited = 1
  return { blocks: chain(start.getNextBlock(), false), visited }
}

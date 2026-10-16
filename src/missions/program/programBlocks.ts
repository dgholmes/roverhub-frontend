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
 * statement (DO, ELSE) and value (COND) inputs. `visited` counts every block
 * reached, so the caller can tell how many on the canvas are not connected.
 */
export function programBlocksFrom(start: BlockLike | null): { blocks: ProgramBlock[]; visited: number } {
  let visited = 0
  const one = (b: BlockLike): ProgramBlock => {
    visited++
    const inputs: ProgramBlock['inputs'] = {}
    for (const input of b.inputList) {
      if (!input.name) continue
      if (input.type === INPUT_STATEMENT) inputs[input.name] = chain(b.getInputTargetBlock(input.name))
      else if (input.type === INPUT_VALUE) {
        const target = b.getInputTargetBlock(input.name)
        inputs[input.name] = target ? one(target) : null
      }
    }
    return { id: b.id, type: b.type, fields: fieldsOf(b), inputs }
  }
  const chain = (first: BlockLike | null): ProgramBlock[] => {
    const out: ProgramBlock[] = []
    for (let b = first; b; b = b.getNextBlock()) out.push(one(b))
    return out
  }
  if (!start) return { blocks: [], visited: 0 }
  visited = 1
  return { blocks: chain(start.getNextBlock()), visited }
}

import { describe, expect, it } from 'vitest'
import { INPUT_STATEMENT, INPUT_VALUE, programBlocksFrom, type BlockLike } from './programBlocks'

type Spec = {
  id: string
  type: string
  fields?: Record<string, unknown>
  statements?: Record<string, Spec[]>
  values?: Record<string, Spec | null>
}

/** Builds a Blockly-shaped block chain from plain specs. */
function chain(specs: Spec[]): BlockLike | null {
  const blocks = specs.map(make)
  blocks.forEach((b, i) => { b.getNextBlock = () => blocks[i + 1] ?? null })
  return blocks[0] ?? null
}

function make(s: Spec): BlockLike {
  const inputList: BlockLike['inputList'][number][] = [
    { name: '', type: 5, fieldRow: Object.entries(s.fields ?? {}).map(([name, v]) => ({ name, getValue: () => v })) },
  ]
  const targets = new Map<string, BlockLike | null>()
  for (const [name, list] of Object.entries(s.statements ?? {})) {
    inputList.push({ name, type: INPUT_STATEMENT, fieldRow: [] })
    targets.set(name, chain(list))
  }
  for (const [name, v] of Object.entries(s.values ?? {})) {
    inputList.push({ name, type: INPUT_VALUE, fieldRow: [{ getValue: () => 'label without a name' }] })
    targets.set(name, v ? make(v) : null)
  }
  return {
    id: s.id, type: s.type, inputList,
    getNextBlock: () => null,
    getInputTargetBlock: (name) => targets.get(name) ?? null,
  }
}

describe('programBlocksFrom', () => {
  it('walks the chain after Start, into statement and value inputs', () => {
    const start = chain([
      { id: 's', type: 'rh_start' },
      { id: 'm', type: 'rh_mode', fields: { MODE: 'stand' } },
      {
        id: 'r', type: 'rh_repeat', fields: { TIMES: 2 },
        statements: { DO: [{ id: 'mv', type: 'rh_move', fields: { DIRECTION: 'forward', DISTANCE: 1 } }, { id: 'rot', type: 'rh_rotate', fields: { DIRECTION: 'left', ANGLE: 90 } }] },
      },
      {
        id: 'if', type: 'rh_if',
        values: { COND: { id: 'c', type: 'rh_cond_battery_below', fields: { PCT: 30 } } },
        statements: { DO: [{ id: 'w', type: 'rh_wait', fields: { SECONDS: 1 } }], ELSE: [] },
      },
    ])
    const { blocks, visited } = programBlocksFrom(start)
    expect(blocks.map((b) => b.id)).toEqual(['m', 'r', 'if'])
    expect(blocks[0]).toEqual({ id: 'm', type: 'rh_mode', fields: { MODE: 'stand' }, inputs: {} })
    expect((blocks[1].inputs.DO as { id: string }[]).map((b) => b.id)).toEqual(['mv', 'rot'])
    expect(blocks[1].fields.TIMES).toBe(2)
    expect(blocks[2].inputs.COND).toMatchObject({ id: 'c', fields: { PCT: 30 } })
    expect(blocks[2].inputs.ELSE).toEqual([])
    // start + m + r + mv + rot + if + c + w
    expect(visited).toBe(8)
  })

  it('keeps an empty condition socket as null', () => {
    const { blocks } = programBlocksFrom(chain([{ id: 's', type: 'rh_start' }, { id: 'u', type: 'rh_wait_until', values: { COND: null } }]))
    expect(blocks[0].inputs).toEqual({ COND: null })
  })

  it('has no program without a Start block', () => {
    expect(programBlocksFrom(null)).toEqual({ blocks: [], visited: 0 })
  })
})

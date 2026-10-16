import { describe, expect, it } from 'vitest'
import { INPUT_STATEMENT, INPUT_VALUE, programBlocksFrom, type BlockLike } from './programBlocks'

type Spec = {
  id: string
  type: string
  fields?: Record<string, unknown>
  statements?: Record<string, Spec[]>
  values?: Record<string, Spec | null>
  disabled?: boolean
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
    isEnabled: () => !s.disabled,
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

  it('skips a disabled block and everything inside it, and carries on after it', () => {
    const start = chain([
      { id: 's', type: 'rh_start' },
      { id: 'a', type: 'rh_wait', fields: { SECONDS: 1 } },
      {
        id: 'r', type: 'rh_repeat', fields: { TIMES: 2 }, disabled: true,
        statements: { DO: [{ id: 'in', type: 'rh_move', fields: { DIRECTION: 'forward', DISTANCE: 1 } }] },
      },
      { id: 'off', type: 'rh_stop_sound', disabled: true },
      {
        id: 'if', type: 'rh_if',
        values: { COND: { id: 'c', type: 'rh_cond_fallen', disabled: true } },
        statements: { DO: [{ id: 'd1', type: 'rh_stop_sound', disabled: true }, { id: 'd2', type: 'rh_stop_sound' }], ELSE: [] },
      },
    ])
    const { blocks, visited } = programBlocksFrom(start)
    expect(blocks.map((b) => b.id)).toEqual(['a', 'if'])
    expect(blocks[1].inputs.COND).toBeNull()
    expect((blocks[1].inputs.DO as { id: string }[]).map((b) => b.id)).toEqual(['d2'])
    // Disabled blocks are still connected, so they count as reached.
    expect(visited).toBe(9)
  })

  it('has no program without a Start block', () => {
    expect(programBlocksFrom(null)).toEqual({ blocks: [], visited: 0 })
  })
})

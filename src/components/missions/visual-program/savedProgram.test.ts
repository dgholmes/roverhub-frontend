import { describe, expect, it } from 'vitest'
import { savedProgramBlocks } from './savedProgram'

const state = (chain: object | null) => JSON.stringify({
  blocks: {
    languageVersion: 0,
    blocks: [{ type: 'rh_start', id: 'start', x: 30, y: 30, deletable: false, ...(chain ? { next: { block: chain } } : {}) }],
  },
})

describe('savedProgramBlocks', () => {
  it('reads a saved program the way the canvas does', () => {
    const blocks = savedProgramBlocks(state({
      type: 'rh_mode', id: 'm', fields: { MODE: 'ready' },
      next: { block: { type: 'rh_lights', id: 'l', fields: { WHICH: 'front', STATE: 'on' } } },
    }))
    expect(blocks).toEqual([
      { id: 'm', type: 'rh_mode', fields: { MODE: 'ready' }, inputs: {} },
      { id: 'l', type: 'rh_lights', fields: { WHICH: 'front', STATE: 'on' }, inputs: {} },
    ])
  })

  it('leaves out a disabled block, as the canvas does', () => {
    const blocks = savedProgramBlocks(state({
      type: 'rh_mode', id: 'm', fields: { MODE: 'ready' }, enabled: false,
      next: { block: { type: 'rh_lights', id: 'l', fields: { WHICH: 'front', STATE: 'on' } } },
    }))
    expect(blocks?.map((b) => b.id)).toEqual(['l'])
  })

  it('reads an empty program as no blocks, not as no program', () => {
    expect(savedProgramBlocks(state(null))).toEqual([])
  })

  it('has nothing to read without a saved program, or with a broken one', () => {
    expect(savedProgramBlocks(undefined)).toBeNull()
    expect(savedProgramBlocks('')).toBeNull()
    expect(savedProgramBlocks('{not json')).toBeNull()
    expect(savedProgramBlocks(JSON.stringify({ blocks: { languageVersion: 0, blocks: [] } }))).toBeNull()
  })
})

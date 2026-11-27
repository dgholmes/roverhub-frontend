import { describe, expect, it } from 'vitest'
import { can, CAPABILITIES } from './roles'

describe('can', () => {
  it('gives edge device tools, the terminal included, to engineers only', () => {
    expect(can('engineer', 'edgeTools')).toBe(true)
    for (const r of ['viewer', 'operator', 'supervisor', 'technician'] as const) expect(can(r, 'edgeTools')).toBe(false)
  })
  it('lets every role but viewer E-Stop', () => {
    expect(can('viewer', 'estop')).toBe(false)
    expect(can('operator', 'estop')).toBe(true)
  })
  it('gives the engineer every capability (2026-11-27): Engineer tools then give an owner everything', () => {
    for (const g of CAPABILITIES) for (const c of g.items) expect(can('engineer', c.id)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { can } from './roles'

describe('can', () => {
  it('gives edge device tools, the terminal included, to engineers only', () => {
    expect(can('engineer', 'edgeTools')).toBe(true)
    for (const r of ['viewer', 'operator', 'supervisor', 'technician'] as const) expect(can(r, 'edgeTools')).toBe(false)
  })
  it('lets every role but viewer E-Stop', () => {
    expect(can('viewer', 'estop')).toBe(false)
    expect(can('operator', 'estop')).toBe(true)
  })
})

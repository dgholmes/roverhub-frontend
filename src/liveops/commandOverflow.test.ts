import { describe, expect, it } from 'vitest'

import { partitionCommandButtons } from './commandOverflow'
import type { CommandType } from '@/types'

interface Btn { type: CommandType }

const btn = (type: CommandType): Btn => ({ type })

describe('partitionCommandButtons', () => {
  it('keeps every button inline when none are demoted', () => {
    const buttons = [btn('SPEAK'), btn('LED_SIGNAL')]

    const { inline, overflow } = partitionCommandButtons(buttons, new Set<CommandType>())

    expect(inline).toEqual(buttons)
    expect(overflow).toEqual([])
  })

  it('moves demoted buttons to the overflow menu', () => {
    const buttons = [btn('SPEAK'), btn('PAUSE'), btn('LED_SIGNAL'), btn('DOCK')]

    const { inline, overflow } = partitionCommandButtons(
      buttons, new Set<CommandType>(['PAUSE', 'DOCK']),
    )

    expect(inline.map((b) => b.type)).toEqual(['SPEAK', 'LED_SIGNAL'])
    expect(overflow.map((b) => b.type)).toEqual(['PAUSE', 'DOCK'])
  })

  it('preserves declaration order within each group', () => {
    const buttons = [btn('DOCK'), btn('PAUSE'), btn('RETURN')]

    const { overflow } = partitionCommandButtons(
      buttons, new Set<CommandType>(['DOCK', 'PAUSE', 'RETURN']),
    )

    expect(overflow.map((b) => b.type)).toEqual(['DOCK', 'PAUSE', 'RETURN'])
  })

  it('reports an empty overflow so the caller can skip rendering a trigger', () => {
    // A "..." button that opens an empty menu is worse than no button: it
    // advertises hidden controls that do not exist.
    const { overflow } = partitionCommandButtons([btn('SPEAK')], new Set<CommandType>(['PAUSE']))

    expect(overflow).toEqual([])
  })

  it('can demote every button, leaving nothing inline', () => {
    const buttons = [btn('PAUSE'), btn('DOCK')]

    const { inline, overflow } = partitionCommandButtons(
      buttons, new Set<CommandType>(['PAUSE', 'DOCK']),
    )

    expect(inline).toEqual([])
    expect(overflow.map((b) => b.type)).toEqual(['PAUSE', 'DOCK'])
  })

  it('never mutates the input array', () => {
    const buttons = [btn('SPEAK'), btn('PAUSE')]
    const before = [...buttons]

    partitionCommandButtons(buttons, new Set<CommandType>(['PAUSE']))

    expect(buttons).toEqual(before)
  })
})

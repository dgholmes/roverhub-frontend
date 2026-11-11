import { beforeEach, describe, expect, it } from 'vitest'
import { zIndex } from '@/design-system/tokens'
import { cardLayer, useCardStack } from './barCardStack'

const layer = (id: string) => cardLayer(useCardStack.getState().order, id)
const { raise, release } = useCardStack.getState()

beforeEach(() => useCardStack.setState({ order: [] }))

describe('card stack', () => {
  it('puts the card opened last on top', () => {
    raise('speak')
    raise('speed')
    expect(layer('speed')).toBeGreaterThan(layer('speak'))
  })

  it('brings a card pressed again back to the top', () => {
    raise('speak')
    raise('speed')
    raise('speak')
    expect(layer('speak')).toBeGreaterThan(layer('speed'))
  })

  it('takes a closed card out, and the rest keep their order', () => {
    raise('a')
    raise('b')
    raise('c')
    release('b')
    expect(useCardStack.getState().order).toEqual(['a', 'c'])
    expect(layer('c')).toBeGreaterThan(layer('a'))
  })

  it('stays above the floating-card base and below dialogs however often cards open', () => {
    for (let i = 0; i < 500; i++) {
      raise('speak')
      raise('speed')
    }
    expect(useCardStack.getState().order).toEqual(['speak', 'speed'])
    expect(layer('speak')).toBeGreaterThanOrEqual(zIndex.floatingCard)
    expect(layer('speed')).toBeLessThan(zIndex.modal)
  })

  it('leaves the state alone when raising the top card or releasing an unknown one', () => {
    raise('speak')
    const before = useCardStack.getState()
    raise('speak')
    release('nope')
    expect(useCardStack.getState()).toBe(before)
  })
})

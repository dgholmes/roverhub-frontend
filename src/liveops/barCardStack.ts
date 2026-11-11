import { create } from 'zustand'
import { zIndex } from '@/design-system/tokens'

/**
 * Which open card is on top. Opening a card, or pressing anywhere inside one,
 * moves it to the end of `order`; closing it takes it out. A card's z-index is
 * its place in that order above zIndex.floatingCard, so the card the operator
 * touched last is always the one in front, and the numbers stay small however
 * many times cards are opened -- they never climb into the modal layer.
 */
interface CardStackState {
  order: string[]
  raise: (id: string) => void
  release: (id: string) => void
}

export const useCardStack = create<CardStackState>((set) => ({
  order: [],
  raise: (id) => set((s) => (
    s.order[s.order.length - 1] === id ? s : { order: [...s.order.filter((o) => o !== id), id] }
  )),
  release: (id) => set((s) => (
    s.order.includes(id) ? { order: s.order.filter((o) => o !== id) } : s
  )),
}))

/** The z-index for card `id` in `order`. A card not in the stack (not yet
 * raised) sits on the base layer. */
export function cardLayer(order: readonly string[], id: string): number {
  const place = Math.max(0, order.indexOf(id))
  return Math.min(zIndex.floatingCard + place, zIndex.floatingCardTop)
}

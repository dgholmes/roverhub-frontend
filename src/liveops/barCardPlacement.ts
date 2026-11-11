/**
 * Where a card that opens upward from a button goes (BarCard): above its
 * anchor, kept `gap` off every piece of chrome around it -- the command bar
 * below, the site bar above, the side bars either side.
 *
 * The chrome is measured, not assumed: an element marks itself with
 * `data-card-bound="top|bottom|left|right"` and readCardBounds turns the marked
 * elements' rects into the free area between them. Nothing here knows the
 * layout's sizes, so a bar that wraps to two rows or a rail that is resized
 * moves the card with it.
 */

export const CARD_BOUND_ATTR = 'data-card-bound'
export type CardBoundSide = 'top' | 'bottom' | 'left' | 'right'

/** The parts of a DOMRect this needs, so tests can pass plain objects. */
export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

export type CardAlign = 'left' | 'center' | 'right'

export interface CardPlacement {
  top: number
  left: number
  /** The card scrolls inside past this. */
  maxHeight: number
  /** Narrower than the card's own width only when the free area is. */
  maxWidth: number
}

/**
 * Places a card of `size` above `anchor`, inside `bounds`, `gap` off each edge.
 *
 * The card's bottom sits `gap` above whichever is higher: the anchor, or the
 * bottom bound. A button in the command bar is below the bar's top edge, so its
 * card clears the whole bar -- not just its own button, which on a wrapped bar
 * would leave the card over the row above. A button floating over the view
 * (Quick Actions) is above the bar, so its card clears the button.
 *
 * Horizontally it lines up with the anchor's `align` edge, then is pushed back
 * inside the side bounds.
 */
export function placeCard({ anchor, bounds, size, gap, align = 'right' }: {
  anchor: Box
  bounds: Box
  size: { width: number; height: number }
  gap: number
  align?: CardAlign
}): CardPlacement {
  const floor = Math.min(anchor.top, bounds.bottom) - gap
  const ceiling = bounds.top + gap
  const maxHeight = Math.max(0, floor - ceiling)
  const height = Math.min(size.height, maxHeight)

  const minLeft = bounds.left + gap
  const maxWidth = Math.max(0, bounds.right - gap - minLeft)
  const width = Math.min(size.width, maxWidth)
  const wanted = align === 'left' ? anchor.left
    : align === 'center' ? (anchor.left + anchor.right - width) / 2
    : anchor.right - width
  const left = Math.max(minLeft, Math.min(wanted, bounds.right - gap - width))

  return { top: floor - height, left, maxHeight, maxWidth }
}

/**
 * The free area between the marked chrome inside `scope`, starting from the
 * viewport: the lowest bottom of the `top` elements, the highest top of the
 * `bottom` ones, and likewise for the sides. Elements not laid out (a zero
 * rect) are skipped.
 *
 * `scope` matters in fullscreen: only the fullscreen element is on screen, and
 * the side bars outside it still report their rects.
 */
export function readCardBounds(scope: ParentNode, viewport: { width: number; height: number }): Box {
  const bounds: Box = { top: 0, right: viewport.width, bottom: viewport.height, left: 0 }
  for (const el of scope.querySelectorAll<HTMLElement>(`[${CARD_BOUND_ATTR}]`)) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    switch (el.getAttribute(CARD_BOUND_ATTR) as CardBoundSide) {
      case 'top': bounds.top = Math.max(bounds.top, r.bottom); break
      case 'bottom': bounds.bottom = Math.min(bounds.bottom, r.top); break
      case 'left': bounds.left = Math.max(bounds.left, r.right); break
      case 'right': bounds.right = Math.min(bounds.right, r.left); break
    }
  }
  return bounds
}

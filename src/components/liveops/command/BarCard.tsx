import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { color, font, layout, radius, shadow, space } from '@/design-system/tokens'
import { usePortalContainer } from '@/lib/usePortalContainer'
import { placeCard, readCardBounds, type CardAlign, type CardPlacement } from '@/liveops/barCardPlacement'
import { cardLayer, useCardStack } from '@/liveops/barCardStack'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
}

/** The anchor's own button: where focus goes back to from the card. */
function lastFocusable(root: ParentNode): HTMLElement | undefined {
  const all = focusables(root)
  return all[all.length - 1]
}

/**
 * The card a command-bar button opens above itself -- Speak, Speed, the "..."
 * menu, Quick Actions. One component so they all sit and stack the same way.
 *
 * Until 2026-11-11 each card was `position: absolute` inside its button's
 * wrapper. That left it at the mercy of whatever stacking context the wrapper
 * was in (the command bar is a size container, which makes it one), so a card
 * could open underneath the live view's overlays, and it sat 8px above its own
 * button -- flush with the bar's top edge, or over the row above on a wrapped
 * bar. Now it is portalled (into the fullscreen element when there is one; see
 * usePortalContainer) and placed with `position: fixed`:
 *
 * - above the anchor, `layout.floatingCardGap` clear of the command bar, the
 *   site bar and the side bars, measured from the elements that mark themselves
 *   `data-card-bound` (liveops/barCardPlacement.ts). Too tall for the space and
 *   it scrolls inside.
 * - the card opened or pressed last is on top of every other card and of the
 *   rest of the console, below dialogs only (liveops/barCardStack.ts).
 *
 * Closes on a press outside both the card and `anchorRef` (so the anchor's own
 * button toggles it), and on Esc. Tab moves from the anchor into the card and
 * on out of it to whatever follows the anchor, as it did when the card sat next
 * to its button in the DOM.
 */
export function BarCard({
  open, onClose, anchorRef, width, align = 'right', style, children,
}: {
  open: boolean
  onClose: () => void
  /** What the card opens above. Presses inside it do not count as outside. */
  anchorRef: React.RefObject<HTMLElement | null>
  width: number
  align?: CardAlign
  /** Applied to the card's content box: padding (default space[2]), layout. */
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const id = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const container = usePortalContainer()
  const [placement, setPlacement] = useState<CardPlacement | null>(null)
  const raise = useCardStack((s) => s.raise)
  const release = useCardStack((s) => s.release)
  const z = useCardStack((s) => cardLayer(s.order, id))
  // Callers pass a fresh arrow each render; the listeners read the latest one.
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    raise(id)
    return () => release(id)
  }, [open, id, raise, release])

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    function place() {
      const anchor = anchorRef.current
      const content = contentRef.current
      if (!anchor || !content) return
      const bounds = readCardBounds(
        document.fullscreenElement ?? document,
        { width: window.innerWidth, height: window.innerHeight },
      )
      setPlacement(placeCard({
        anchor: anchor.getBoundingClientRect(),
        bounds,
        size: { width, height: content.offsetHeight },
        gap: layout.floatingCardGap,
        align,
      }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    // The content changes height as tabs switch or clips are added; the card
    // grows upward, so its top has to move with it.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    if (contentRef.current) observer?.observe(contentRef.current)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      observer?.disconnect()
    }
  }, [open, width, align, anchorRef, container])

  useEffect(() => {
    if (!open) return
    function onPressOutside(e: MouseEvent) {
      const target = e.target as Node
      if (cardRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onCloseRef.current()
    }
    function onKeyDown(e: KeyboardEvent) {
      const card = cardRef.current
      const anchor = anchorRef.current
      if (!card || !anchor) return
      if (e.key === 'Escape') {
        // Only the top card, and not while a dialog the card opened is taking
        // the key (Quick Actions' confirm).
        const target = e.target as Element | null
        if (target?.closest?.('[role="dialog"], [role="alertdialog"]')) return
        const order = useCardStack.getState().order
        if (order[order.length - 1] !== id) return
        if (card.contains(document.activeElement)) lastFocusable(anchor)?.focus()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const inCard = focusables(card)
      if (inCard.length === 0) return
      const active = document.activeElement
      if (!e.shiftKey && active && anchor.contains(active)) {
        e.preventDefault()
        inCard[0].focus()
      } else if (e.shiftKey && active === inCard[0]) {
        e.preventDefault()
        lastFocusable(anchor)?.focus()
      } else if (!e.shiftKey && active === inCard[inCard.length - 1]) {
        const next = focusables(document).find((el) =>
          !card.contains(el) && !anchor.contains(el)
          && (anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        if (next) {
          e.preventDefault()
          next.focus()
        }
      }
    }
    window.addEventListener('mousedown', onPressOutside)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPressOutside)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, id, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={cardRef}
      data-bar-card=""
      onPointerDown={() => raise(id)}
      style={{
        position: 'fixed', zIndex: z,
        top: placement?.top ?? 0, left: placement?.left ?? 0,
        width: placement ? Math.min(width, placement.maxWidth) : width,
        maxHeight: placement?.maxHeight, overflowY: 'auto',
        // Hidden for the one layout pass before it has been measured.
        visibility: placement ? 'visible' : 'hidden',
        background: color.elevated, borderRadius: radius.lg, boxShadow: shadow.lg,
        color: color.t1, fontFamily: font.family,
      }}
    >
      <div ref={contentRef} style={{ padding: space[2], ...style }}>
        {children}
      </div>
    </div>,
    container ?? document.body,
  )
}

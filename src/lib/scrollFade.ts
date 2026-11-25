import { useEffect, useLayoutEffect, useState } from 'react'

/**
 * Make a row that scrolls sideways look like one.
 *
 * A fixed-height bar cannot wrap — a wrapped row would be clipped rather than
 * push anything down — so the touch dock and the strip scroll instead, with
 * the scrollbar hidden because a 3 px bar under a finger is not a control.
 * What the operator saw was the last control guillotined mid-word against the
 * edge, which reads as a rendering fault rather than as "there is more this
 * way": a chip cut in half next to a working "More" button looks broken
 * (operator, 2026-11-25).
 *
 * So the content fades out at whichever end has more behind it. The fade is
 * the affordance; it is not decoration, and it is absent at an end that has
 * nothing beyond it, so a row that fits is drawn exactly as before.
 *
 * ⚠️ A mask hides pixels, never hit targets. The half-shown control under the
 * fade is still pressable, which is the point: the fade says "keep going",
 * it does not take the control away.
 */

/** How much of each scrolling end dissolves. Wide enough to read as a fade
 * rather than as a soft edge on an otherwise sharp cut. */
export const SCROLL_FADE_PX = 24

/** Which ends of a scroller have content beyond them. */
export interface ScrollEdges {
  /** Scrolled away from the start: something is hidden to the left. */
  start: boolean
  /** Not at the end yet: something is hidden to the right. */
  end: boolean
}

export const NO_SCROLL_EDGES: ScrollEdges = { start: false, end: false }

/**
 * Fractional layout: a row 801.6 px wide in an 800 px box leaves a `scrollLeft`
 * that never reaches its own maximum, and a device-pixel rounding difference is
 * not "there is more to see". A whole pixel of slack at each end.
 */
const SLACK_PX = 1

/** Which ends of `el` are scrolled away from, read straight from the DOM. */
export function scrollEdgesOf(el: {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}): ScrollEdges {
  const max = el.scrollWidth - el.clientWidth
  if (max <= SLACK_PX) return NO_SCROLL_EDGES
  return { start: el.scrollLeft > SLACK_PX, end: el.scrollLeft < max - SLACK_PX }
}

/**
 * The mask that dissolves those ends, or nothing at all when neither end has
 * anything behind it — a row that fits gets no mask, and so no compositing
 * layer it did not need.
 *
 * Both spellings: `-webkit-mask-image` is what Safari on an iPad still reads,
 * and an iPad is the device this shell exists for.
 */
export function scrollFadeStyle(edges: ScrollEdges, fade = SCROLL_FADE_PX): React.CSSProperties {
  if (!edges.start && !edges.end) return {}
  const head = edges.start ? fade : 0
  const tail = edges.end ? fade : 0
  const mask = `linear-gradient(to right, transparent 0, #000 ${head}px,`
    + ` #000 calc(100% - ${tail}px), transparent 100%)`
  return { maskImage: mask, WebkitMaskImage: mask } as React.CSSProperties
}

/**
 * Track those ends as the row is scrolled, resized, or re-rendered with
 * different content.
 *
 * Three triggers, because all three happen here: a drag (`scroll`), a rotation
 * (`ResizeObserver` on the box), and a label that changes width under a row
 * that did not — Avoidance on to off, Switch to X-shape to Switch to normal —
 * which moves `scrollWidth` with no event of its own. The last is why the
 * measurement also runs after every render; it is two property reads, and the
 * state is kept by identity so an unchanged answer re-renders nothing.
 */
export function useScrollEdges(ref: React.RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(NO_SCROLL_EDGES)

  const measure = () => {
    const el = ref.current
    if (!el) return
    const next = scrollEdgesOf(el)
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }

  // After every render: content the row did not resize for.
  useLayoutEffect(measure)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    // The `node` test environment has no ResizeObserver, and neither do a few
    // old mobile browsers; both then keep the measurements above.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])

  return edges
}

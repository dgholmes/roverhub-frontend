import { describe, expect, it } from 'vitest'
import { NO_SCROLL_EDGES, SCROLL_FADE_PX, scrollEdgesOf, scrollFadeStyle } from './scrollFade'

/**
 * The touch dock and the strip scroll sideways with their scrollbars hidden,
 * so the fade at each end is the only thing that says there is more. What is
 * pinned here is the two decisions that make it honest: a fade appears only at
 * an end that has content behind it, and a row that fits gets no mask at all.
 */

/** A scroller, as the two numbers and the offset that decide its ends. */
const at = (scrollLeft: number, scrollWidth: number, clientWidth = 500) =>
  ({ scrollLeft, scrollWidth, clientWidth })

describe('scrollEdgesOf', () => {
  it('fades the end a row that overflows has not reached', () => {
    expect(scrollEdgesOf(at(0, 800))).toEqual({ start: false, end: true })
  })

  it('fades both ends in the middle of a scroll', () => {
    expect(scrollEdgesOf(at(150, 800))).toEqual({ start: true, end: true })
  })

  it('drops the end fade once the row is scrolled to its end', () => {
    expect(scrollEdgesOf(at(300, 800))).toEqual({ start: true, end: false })
  })

  it('fades nothing at all when the row fits', () => {
    // The measured tablet-landscape dock: 909 of content in 909 of row.
    expect(scrollEdgesOf(at(0, 909, 909))).toEqual(NO_SCROLL_EDGES)
    expect(scrollEdgesOf(at(0, 400))).toEqual(NO_SCROLL_EDGES)
  })

  it('ignores a sub-pixel overflow, which is rounding and not content', () => {
    // A row 500.6 px wide in a 500 px box is not "there is more to see", and
    // its scrollLeft can never reach its own maximum either -- which would
    // leave the end fade on for ever.
    expect(scrollEdgesOf(at(0, 501))).toEqual(NO_SCROLL_EDGES)
    expect(scrollEdgesOf(at(0.4, 800))).toEqual({ start: false, end: true })
    expect(scrollEdgesOf(at(299.5, 800))).toEqual({ start: true, end: false })
  })
})

describe('scrollFadeStyle', () => {
  it('is nothing at all for a row that fits, so it costs it no layer', () => {
    expect(scrollFadeStyle(NO_SCROLL_EDGES)).toEqual({})
  })

  it('dissolves only the end that has something behind it', () => {
    const end = scrollFadeStyle({ start: false, end: true }) as Record<string, string>
    // Opaque from the very first pixel on the left...
    expect(end.maskImage).toContain('#000 0px')
    // ...and dissolving over the last SCROLL_FADE_PX on the right.
    expect(end.maskImage).toContain(`calc(100% - ${SCROLL_FADE_PX}px)`)

    const start = scrollFadeStyle({ start: true, end: false }) as Record<string, string>
    expect(start.maskImage).toContain(`#000 ${SCROLL_FADE_PX}px`)
    expect(start.maskImage).toContain('calc(100% - 0px)')
  })

  it('writes the WebKit spelling too, for Safari on the iPad this shell is for', () => {
    const style = scrollFadeStyle({ start: true, end: true }) as Record<string, string>
    expect(style.WebkitMaskImage).toBe(style.maskImage)
    expect(style.maskImage).toContain(`#000 ${SCROLL_FADE_PX}px`)
    expect(style.maskImage).toContain(`calc(100% - ${SCROLL_FADE_PX}px)`)
  })

  it('takes a fade width, so a short row can dissolve over less', () => {
    const style = scrollFadeStyle({ start: false, end: true }, 8) as Record<string, string>
    expect(style.maskImage).toContain('calc(100% - 8px)')
  })
})

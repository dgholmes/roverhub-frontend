import { describe, expect, it } from 'vitest'
import { layoutFor } from '@/lib/touchShell'
import { PANE_GAP, paneStyle, watchPanes, type PaneGeometry, type Rect } from './touchLayout'

/**
 * The watching layout's geometry, pinned in the project's `node` environment.
 *
 * `touchLayout.ts` is deliberately pure -- no React, no DOM, no measurement --
 * because the one thing worth pinning here is the arithmetic that decides how
 * much of a handheld screen the map gets. The shell measures its body with a
 * `ResizeObserver` and hands the numbers in; everything below is what it does
 * with them.
 */

/** The strip and dock heights the shell owns (design §7.2). Restated rather
 * than imported: `TouchTopStrip`/`TouchDock` pull i18n and the whole command
 * stack into a `node` process, and `TouchLiveOps.test.tsx` already pins that
 * these are the heights those components render. */
const CHROME = {
  big: { barH: 44, dockH: 72 },
  small: { barH: 40, dockH: 64 },
}

/** The geometry the shell builds for a viewport: the body is what is left of
 * the screen once the strip and the dock have taken theirs. */
function geometryFor(viewport: { width: number; height: number }, immersive = false): PaneGeometry {
  const { orientation, big } = layoutFor(viewport)
  const { barH, dockH } = big ? CHROME.big : CHROME.small
  const bar = immersive ? 0 : barH
  return {
    orientation, big, barH: bar, dockH,
    width: viewport.width,
    height: viewport.height - bar - dockH,
  }
}

// The four devices the design is drawn for.
const TABLET_LANDSCAPE = { width: 1194, height: 834 }
const TABLET_PORTRAIT = { width: 834, height: 1194 }
const PHONE_LANDSCAPE = { width: 844, height: 390 }
const PHONE_PORTRAIT = { width: 390, height: 844 }

const right = (r: Rect) => r.left + r.width
const bottom = (r: Rect) => r.top + r.height

describe('watchPanes', () => {
  it('landscape splits side by side at 58/42 with a 3px gap', () => {
    for (const viewport of [TABLET_LANDSCAPE, PHONE_LANDSCAPE]) {
      const o = geometryFor(viewport)
      const { map, camera } = watchPanes(o)

      // Side by side, map first.
      expect(map.top).toBe(0)
      expect(camera.top).toBe(0)
      expect(map.height).toBe(o.height)
      expect(camera.height).toBe(o.height)

      // 3 px of gap, and nothing else between or around them: the panes tile
      // the body edge to edge, which is the whole complaint this task answers.
      expect(map.left).toBe(0)
      expect(camera.left).toBe(right(map) + PANE_GAP)
      expect(right(camera)).toBe(o.width)
      expect(PANE_GAP).toBe(3)

      // 58 / 42 of what is left once the gap is taken.
      const usable = o.width - PANE_GAP
      expect(map.width / usable).toBeCloseTo(0.58, 2)
      expect(camera.width / usable).toBeCloseTo(0.42, 2)
      expect(map.width).toBeGreaterThan(camera.width)
    }
  })

  it('portrait stacks map over camera at ~54%', () => {
    for (const viewport of [TABLET_PORTRAIT, PHONE_PORTRAIT]) {
      const o = geometryFor(viewport)
      const { map, camera } = watchPanes(o)

      expect(map.left).toBe(0)
      expect(camera.left).toBe(0)
      expect(map.width).toBe(o.width)
      expect(camera.width).toBe(o.width)

      expect(map.top).toBe(0)
      expect(camera.top).toBe(bottom(map) + PANE_GAP)
      expect(bottom(camera)).toBe(o.height)

      const usable = o.height - PANE_GAP
      expect(map.height / usable).toBeCloseTo(0.54, 2)
      expect(map.height).toBeGreaterThan(camera.height)
    }
  })

  // The rects are in the body's own coordinates, and the body is the box
  // between the strip and the dock. Translated back into the shell's
  // coordinates, no pane may reach into either piece of chrome -- the dock
  // holds the E-Stop, and a pane over it is a stop control that cannot be hit.
  it('panes never overlap the strip or the dock', () => {
    for (const viewport of [TABLET_LANDSCAPE, TABLET_PORTRAIT, PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
      for (const immersive of [false, true]) {
        const o = geometryFor(viewport, immersive)
        const panes = watchPanes(o)
        for (const [name, rect] of Object.entries(panes)) {
          const where = `${viewport.width}x${viewport.height} ${name}${immersive ? ' immersive' : ''}`
          expect(rect.top, where).toBeGreaterThanOrEqual(0)
          expect(rect.left, where).toBeGreaterThanOrEqual(0)
          // In shell coordinates: below the strip, above the dock.
          expect(o.barH + rect.top, where).toBeGreaterThanOrEqual(o.barH)
          expect(o.barH + bottom(rect), where).toBeLessThanOrEqual(viewport.height - o.dockH)
          expect(right(rect), where).toBeLessThanOrEqual(o.width)
        }
      }
    }
  })

  it('every pane has positive width and height at phone-landscape size', () => {
    // The tightest case the design covers: 844 x 390 less a 40 px strip and a
    // 64 px dock leaves 286 px of body for two panes.
    const o = geometryFor(PHONE_LANDSCAPE)
    expect(o.height).toBe(286)
    for (const rect of Object.values(watchPanes(o))) {
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
    }
  })

  // The body has not been measured yet on the first paint, and a pane sized
  // from a 0 x 0 box must come out as nothing rather than as a negative rect
  // that paints over its neighbour.
  it('an unmeasured body yields empty panes rather than negative ones', () => {
    const o: PaneGeometry = { orientation: 'landscape', big: true, width: 0, height: 0, barH: 44, dockH: 72 }
    for (const rect of Object.values(watchPanes(o))) {
      expect(rect.width).toBe(0)
      expect(rect.height).toBe(0)
      expect(rect.left).toBe(0)
      expect(rect.top).toBe(0)
    }
  })
})

describe('paneStyle', () => {
  // "Every pane fills its rect edge to edge" is the user's complaint answered:
  // no inset, no margin, no padding, no border between the picture and the
  // rectangle it was given.
  it('places a pane at its rect exactly, with nothing inset', () => {
    const style = paneStyle({ left: 12, top: 34, width: 500, height: 286 })
    expect(style.position).toBe('absolute')
    expect(style.left).toBe(12)
    expect(style.top).toBe(34)
    expect(style.width).toBe(500)
    expect(style.height).toBe(286)
    expect(style.padding ?? 0).toBe(0)
    expect(style.margin ?? 0).toBe(0)
    expect(style.border ?? 'none').toBe('none')
  })
})

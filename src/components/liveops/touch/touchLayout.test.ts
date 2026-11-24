import { describe, expect, it } from 'vitest'
import { layoutFor } from '@/lib/touchShell'
import {
  CORNER_ESTOP_SIZE, DRIVE_INSET_HEIGHT, DRIVE_INSET_MARGIN, DRIVE_INSET_WIDTH,
  PANE_GAP, cornerEstopSize, drivePanes, paneStyle, watchPanes,
  type PaneGeometry, type Rect,
} from './touchLayout'

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

/**
 * Driving (design §7.2.3, §7.2.4). Holding control means driving, so this is
 * the geometry the body takes the moment `operatorHoldsControl` goes true --
 * there is no third, intermediate layout to test.
 */
describe('drivePanes', () => {
  it('landscape driving: the camera is full-bleed and the map is a top-left inset', () => {
    for (const viewport of [TABLET_LANDSCAPE, PHONE_LANDSCAPE]) {
      const o = geometryFor(viewport)
      const panes = drivePanes(o)
      const where = `${viewport.width}x${viewport.height}`
      if (panes.orientation !== 'landscape') throw new Error(`${where} is not landscape`)

      // Full-bleed: the camera takes the whole body, not a column of it.
      expect(panes.camera, where).toEqual({ left: 0, top: 0, width: o.width, height: o.height })

      // 150 x 96 in the body's top-left corner, clear of the edge.
      expect(panes.mapInset.width, where).toBe(DRIVE_INSET_WIDTH)
      expect(panes.mapInset.height, where).toBe(DRIVE_INSET_HEIGHT)
      expect(panes.mapInset.left, where).toBe(DRIVE_INSET_MARGIN)
      expect(panes.mapInset.top, where).toBe(DRIVE_INSET_MARGIN)

      // It is an INSET: strictly smaller than the rectangle the map shrinks
      // from, which is what the 220 ms transform animates between.
      const watching = watchPanes(o).map
      expect(panes.mapInset.width, where).toBeLessThan(watching.width)
      expect(panes.mapInset.height, where).toBeLessThan(watching.height)
    }
  })

  // Not a squeezed landscape: portrait keeps BOTH views while driving, which
  // is the one place portrait is strictly better than landscape.
  it('portrait driving: the camera keeps 4:3 and the map takes the remainder', () => {
    for (const viewport of [TABLET_PORTRAIT, PHONE_PORTRAIT]) {
      const o = geometryFor(viewport)
      const panes = drivePanes(o)
      const where = `${viewport.width}x${viewport.height}`
      if (panes.orientation !== 'portrait') throw new Error(`${where} is not portrait`)
      const { camera, map } = panes

      // Pinned to the top at its native aspect -- never letterboxed.
      expect(camera.left, where).toBe(0)
      expect(camera.top, where).toBe(0)
      expect(camera.width, where).toBe(o.width)
      expect(camera.width / camera.height, where).toBeCloseTo(4 / 3, 2)

      // And the map takes every pixel underneath.
      expect(map.left, where).toBe(0)
      expect(map.width, where).toBe(o.width)
      expect(map.top, where).toBe(bottom(camera) + PANE_GAP)
      expect(bottom(map), where).toBe(o.height)
      expect(map.height, where).toBeGreaterThan(0)
    }
  })

  it('driving panes never overlap the strip or the dock', () => {
    for (const viewport of [TABLET_LANDSCAPE, TABLET_PORTRAIT, PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
      for (const immersive of [false, true]) {
        const o = geometryFor(viewport, immersive)
        const { orientation, ...panes } = drivePanes(o)
        expect(orientation).toBe(o.orientation)
        for (const [name, rect] of Object.entries(panes) as [string, Rect][]) {
          const where = `${viewport.width}x${viewport.height} ${name}${immersive ? ' immersive' : ''}`
          expect(rect.top, where).toBeGreaterThanOrEqual(0)
          expect(rect.left, where).toBeGreaterThanOrEqual(0)
          expect(o.barH + bottom(rect), where).toBeLessThanOrEqual(viewport.height - o.dockH)
          expect(right(rect), where).toBeLessThanOrEqual(o.width)
          expect(rect.width, where).toBeGreaterThan(0)
          expect(rect.height, where).toBeGreaterThan(0)
        }
      }
    }
  })

  it('an unmeasured body yields empty panes rather than negative ones', () => {
    for (const orientation of ['landscape', 'portrait'] as const) {
      const o: PaneGeometry = { orientation, big: true, width: 0, height: 0, barH: 44, dockH: 72 }
      const { orientation: _o, ...panes } = drivePanes(o)
      for (const rect of Object.values(panes) as Rect[]) {
        expect(rect.width).toBe(0)
        expect(rect.height).toBe(0)
        expect(rect.left).toBe(0)
        expect(rect.top).toBe(0)
      }
    }
  })
})

// Design §7.2.5. Bigger than a dock key and in the corner a palm will not
// find, because while driving both thumbs are on the sticks.
describe('cornerEstopSize', () => {
  it('is 96x60 on a tablet and 72x44 on a phone', () => {
    expect(cornerEstopSize(true)).toEqual({ width: 96, height: 60 })
    expect(cornerEstopSize(false)).toEqual({ width: 72, height: 44 })
    expect(CORNER_ESTOP_SIZE.big).toEqual({ width: 96, height: 60 })
    expect(CORNER_ESTOP_SIZE.small).toEqual({ width: 72, height: 44 })
  })

  // It shares the body's top-right corner with nothing, and the inset is in
  // the opposite one -- so neither can be hit while reaching for the other.
  it('does not reach the map inset in the opposite corner', () => {
    const o = geometryFor(PHONE_LANDSCAPE)
    const panes = drivePanes(o)
    if (panes.orientation !== 'landscape') throw new Error('not landscape')
    const { width } = cornerEstopSize(o.big)
    expect(right(panes.mapInset)).toBeLessThan(o.width - width)
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

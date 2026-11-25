import { describe, expect, it } from 'vitest'
import { layoutFor } from '@/lib/touchShell'
import {
  CORNER_ESTOP_SIZE, DRIVE_INSET_HEIGHT, DRIVE_INSET_MARGIN, DRIVE_INSET_WIDTH,
  CAMERA_TOP_MARGIN, LANDSCAPE_CAMERA_SHARE, PANE_GAP, PORTRAIT_CAMERA_SHARE,
  TABLET_MAP_SHARE_OF_COLUMN, cameraTopInset, cornerEstopSize, drivePanes, paneStyle, watchPanes,
  type PaneGeometry, type Rect, type WatchPanes,
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

/** The rects a result actually carries: `camera2` is absent on a phone and in
 * portrait, and an absent pane is not a pane to assert bounds about. */
const rectsOf = (panes: WatchPanes): [string, Rect][] =>
  Object.entries(panes).filter((e): e is [string, Rect] => e[1] !== null)

describe('watchPanes', () => {
  // The camera is the big pane (design 6.3): it takes the right 58 % and the
  // map the left 42 %, which is the inverse of what M4 shipped.
  it('landscape splits side by side at 42/58 with a 3px gap, camera right', () => {
    for (const viewport of [TABLET_LANDSCAPE, PHONE_LANDSCAPE]) {
      const o = geometryFor(viewport)
      const { map, camera } = watchPanes(o)

      // Side by side, map first. On a tablet the map shares its column with
      // the second camera, so only the full-height camera is pinned here.
      expect(map.top).toBe(0)
      expect(camera.top).toBe(0)
      expect(camera.height).toBe(o.height)

      // 3 px of gap, and nothing else between or around them: the panes tile
      // the body edge to edge, which is the whole complaint this task answers.
      expect(map.left).toBe(0)
      expect(camera.left).toBe(right(map) + PANE_GAP)
      expect(right(camera)).toBe(o.width)
      expect(PANE_GAP).toBe(3)

      // 42 / 58 of what is left once the gap is taken.
      const usable = o.width - PANE_GAP
      expect(camera.width / usable).toBeCloseTo(LANDSCAPE_CAMERA_SHARE, 2)
      expect(map.width / usable).toBeCloseTo(1 - LANDSCAPE_CAMERA_SHARE, 2)
      expect(camera.width).toBeGreaterThan(map.width)
    }
  })

  it('portrait stacks camera over map at ~54%', () => {
    for (const viewport of [TABLET_PORTRAIT, PHONE_PORTRAIT]) {
      const o = geometryFor(viewport)
      const { map, camera } = watchPanes(o)

      expect(map.left).toBe(0)
      expect(camera.left).toBe(0)
      expect(map.width).toBe(o.width)
      expect(camera.width).toBe(o.width)

      expect(camera.top).toBe(0)
      expect(map.top).toBe(bottom(camera) + PANE_GAP)
      expect(bottom(map)).toBe(o.height)

      const usable = o.height - PANE_GAP
      expect(camera.height / usable).toBeCloseTo(PORTRAIT_CAMERA_SHARE, 2)
      expect(camera.height).toBeGreaterThan(map.height)
    }
  })

  // The exact cases the plan pins, at the plan's own numbers.
  it('a landscape phone puts the camera right and bigger, with no second camera', () => {
    const l = watchPanes({ orientation: 'landscape', big: false, width: 800, height: 400, barH: 44, dockH: 64 })
    expect(l.map.left).toBe(0)
    expect(l.camera.left).toBe(l.map.width + PANE_GAP)
    expect(l.camera.width).toBeGreaterThan(l.map.width)
    expect(l.map.width + PANE_GAP + l.camera.width).toBe(800)
    expect(l.camera2).toBeNull()
  })

  it('a portrait phone puts the camera on top and bigger', () => {
    const p = watchPanes({ orientation: 'portrait', big: false, width: 400, height: 700, barH: 44, dockH: 64 })
    expect(p.camera.top).toBe(0)
    expect(p.camera.height).toBeGreaterThan(p.map.height)
    expect(p.camera2).toBeNull()
  })

  // The FlightHub-2 arrangement the operator picked: map over second camera on
  // the left, main camera full height on the right.
  it('a landscape tablet splits the left column, map on top', () => {
    const t = watchPanes({ orientation: 'landscape', big: true, width: 1000, height: 600, barH: 44, dockH: 72 })
    expect(t.camera2).not.toBeNull()
    expect(t.map.left).toBe(0)
    expect(t.camera2!.left).toBe(0)
    expect(t.map.width).toBe(t.camera2!.width)
    expect(t.camera2!.top).toBe(t.map.height + PANE_GAP)
    expect(t.map.height + PANE_GAP + t.camera2!.height).toBe(600)
    expect(t.camera.height).toBe(600)
    // The column's own split is the constant, not a second share of the body.
    const usableH = 600 - PANE_GAP
    expect(t.map.height / usableH).toBeCloseTo(TABLET_MAP_SHARE_OF_COLUMN, 2)
  })

  // Review Focus #2: a third pane exists only for big AND landscape.
  it('keeps two panes on a tablet in portrait and on a phone in landscape', () => {
    expect(watchPanes({ orientation: 'portrait', big: true, width: 800, height: 1000, barH: 44, dockH: 72 }).camera2).toBeNull()
    expect(watchPanes({ orientation: 'landscape', big: false, width: 844, height: 286, barH: 40, dockH: 64 }).camera2).toBeNull()
    expect(watchPanes(geometryFor(TABLET_LANDSCAPE)).camera2).not.toBeNull()
    expect(watchPanes(geometryFor(TABLET_PORTRAIT)).camera2).toBeNull()
    expect(watchPanes(geometryFor(PHONE_LANDSCAPE)).camera2).toBeNull()
    expect(watchPanes(geometryFor(PHONE_PORTRAIT)).camera2).toBeNull()
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
        for (const [name, rect] of rectsOf(panes)) {
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
    for (const [, rect] of rectsOf(watchPanes(o))) {
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
    }
    // And the tablet's three panes, the tightest case for the split column --
    // a tile with no height is the squashed pane the design rules out.
    for (const [, rect] of rectsOf(watchPanes(geometryFor(TABLET_LANDSCAPE)))) {
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
    }
  })

  // The body has not been measured yet on the first paint, and a pane sized
  // from a 0 x 0 box must come out as nothing rather than as a negative rect
  // that paints over its neighbour.
  // Review Focus #3: three panes must survive an unmeasured body as two did.
  it('an unmeasured body yields empty panes rather than negative ones', () => {
    for (const orientation of ['landscape', 'portrait'] as const) {
      for (const big of [true, false]) {
        const o: PaneGeometry = { orientation, big, width: 0, height: 0, barH: 44, dockH: 72 }
        const panes = watchPanes(o)
        expect(panes.camera2, `${orientation} ${big}`).toBeNull()
        for (const [name, rect] of rectsOf(panes)) {
          expect(rect, `${orientation} ${big} ${name}`).toEqual({ left: 0, top: 0, width: 0, height: 0 })
        }
      }
    }
    const z = watchPanes({ orientation: 'landscape', big: true, width: 0, height: 0, barH: 0, dockH: 0 })
    expect(z.camera2).toBeNull()
    expect(z.map).toEqual({ left: 0, top: 0, width: 0, height: 0 })
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
    // `width` is the minimum the box may be, not the width it will have:
    // the label grows it. See the note on CORNER_ESTOP_SIZE.
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

describe('cameraTopInset', () => {
  /**
   * The shell floats a column over the top of the camera in portrait -- the
   * readings band, the map's tool group, and while driving the corner stop
   * above both -- and the camera's own steady badge has to start below it.
   *
   * It used to start at a constant 38 px, which is *inside* the column: the
   * band cut the badge's top, the tool group cut its bottom, and all that
   * reached the operator was a sliver of text with no whole line in it
   * (operator, 2026-11-25). None of the heights involved is knowable up
   * front -- the band wraps on a narrow phone, the tool group is absent
   * without a surveyed floor and grows a hint line when it has one -- so the
   * column is measured and this is the arithmetic on top of it.
   */
  const barH = 44
  const gap = 8

  it('clears a measured column, by one gap', () => {
    // A tablet: the band on one line (44) under an 8 px offset, the tool
    // group (40) and the gap between them -- 92 of column, from y=52.
    expect(cameraTopInset({ overlayTop: barH + gap, overlayHeight: 92, barH, gap })).toBe(108)
  })

  it('follows the column when the readings wrap, rather than a constant', () => {
    // The same shell on a 390 px phone: two lines of readings, so the column
    // is 22 px taller and the badge moves with it. This is the case the
    // constant could not have met at any value.
    const tablet = cameraTopInset({ overlayTop: barH + gap, overlayHeight: 92, barH, gap })
    const phone = cameraTopInset({ overlayTop: barH + gap, overlayHeight: 114, barH, gap })
    expect(phone - tablet).toBe(22)
  })

  it('leaves room for the corner stop the column already stepped below', () => {
    // Driving pushes the column down past the corner E-Stop; the badge is
    // below the column either way, so it inherits that offset for free.
    const watching = cameraTopInset({ overlayTop: barH + gap, overlayHeight: 92, barH, gap })
    const driving = cameraTopInset({ overlayTop: barH + gap + 60 + gap, overlayHeight: 92, barH, gap })
    expect(driving - watching).toBe(68)
  })

  it("is the pane's own margin with no column drawn", () => {
    // Every landscape body, and the first frame of a portrait one before the
    // observer has fired. Never a guessed height.
    expect(cameraTopInset({ overlayTop: barH + gap, overlayHeight: 0, barH, gap })).toBe(CAMERA_TOP_MARGIN)
    expect(cameraTopInset({ overlayTop: 0, overlayHeight: -1, barH, gap })).toBe(CAMERA_TOP_MARGIN)
  })
})

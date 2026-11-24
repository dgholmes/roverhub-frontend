import type { Orientation } from '@/lib/touchShell'

/**
 * Where the touch shell's panes go.
 *
 * Pure arithmetic over a measured body, with no React and no DOM in it, so the
 * one thing that decides how much of a handheld screen the map gets is
 * testable in the project's `node` environment (`touchLayout.test.ts`).
 *
 * ⚠️ **Every pane fills its rect edge to edge.** The complaint this answers is
 * a map that is small, pushed to the side and ringed with chrome; the answer is
 * that the body is tiled by exactly two rectangles with a hairline between
 * them, and whatever each pane needs floats *over* its own rectangle rather
 * than taking space beside it. `paneStyle` is how that is enforced at the one
 * place a rect becomes CSS.
 *
 * Task 14 extends this module with `drivePanes`, which is why `PaneGeometry`
 * carries more than `watchPanes` reads (below).
 */

/** A pane's box in the body's own coordinates: the body's top-left is 0, 0. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Everything a layout may decide from. `width`/`height` are the **body's**
 * measured size -- what is left between the strip and the dock -- because the
 * shell measures that element rather than guessing it from the viewport.
 *
 * `barH` and `dockH` are the chrome around it, and are here because the
 * driving layout (Task 14) places the corner E-Stop below the strip and floats
 * the sticks above the dock; `watchPanes` needs neither, since the body it is
 * given already excludes both.
 */
export interface PaneGeometry {
  orientation: Orientation
  /** Tablet sizing (the viewport's short side is at least 600 px). */
  big: boolean
  width: number
  height: number
  /** Height of the top strip, 0 while immersive. */
  barH: number
  /** Height of the dock. It never collapses, so this is never 0. */
  dockH: number
}

/** The hairline between the two panes. Enough to read as a seam at arm's
 * length and not one pixel more -- the body height is the scarce resource. */
export const PANE_GAP = 3

/** Landscape: the map takes 58 % of the body's width (design §7.2.1). */
export const LANDSCAPE_MAP_SHARE = 0.58

/** Portrait: the map takes 54 % of the body's height (design §7.2.2). */
export const PORTRAIT_MAP_SHARE = 0.54

const EMPTY: Rect = { left: 0, top: 0, width: 0, height: 0 }

/** The two panes the operator watches a run through. */
export interface WatchPanes {
  map: Rect
  camera: Rect
}

/**
 * Split the body between the map and the camera.
 *
 * Landscape puts them side by side, the map at 58 % on the left; portrait
 * stacks them, the map at 54 % on top. In both the two rects plus one
 * `PANE_GAP` account for every pixel of the body exactly, so neither pane is
 * inset and no third region exists for chrome to accumulate in.
 */
export function watchPanes(o: PaneGeometry): WatchPanes {
  const { width, height } = o
  // Before the first measurement the body is 0 x 0. Sizing panes from that
  // must yield nothing, never a negative rect that paints over its neighbour.
  if (width <= 0 || height <= 0) return { map: { ...EMPTY }, camera: { ...EMPTY } }

  if (o.orientation === 'landscape') {
    const gap = gapWithin(width)
    const usable = width - gap
    const mapW = Math.round(usable * LANDSCAPE_MAP_SHARE)
    return {
      map: { left: 0, top: 0, width: mapW, height },
      camera: { left: mapW + gap, top: 0, width: usable - mapW, height },
    }
  }

  const gap = gapWithin(height)
  const usable = height - gap
  const mapH = Math.round(usable * PORTRAIT_MAP_SHARE)
  return {
    map: { left: 0, top: 0, width, height: mapH },
    camera: { left: 0, top: mapH + gap, width, height: usable - mapH },
  }
}

/** The seam, unless the axis is so short that a seam would cost a pane its
 * picture. Only reachable on a body smaller than any device the design covers. */
function gapWithin(axis: number): number {
  return axis > PANE_GAP * 2 ? PANE_GAP : 0
}

/**
 * A rect, as the style of an absolutely-positioned pane.
 *
 * The one place a `Rect` becomes CSS, so "the pane fills its rect" is a
 * property of this function rather than of each caller's inline style: no
 * padding, no margin, no border, nothing that would leave the picture short of
 * an edge it was given.
 */
export function paneStyle(rect: Rect): React.CSSProperties {
  return {
    position: 'absolute',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    // Each pane's own overlays (labels, the capture rail, the run card) are
    // positioned against this box and clipped by it.
    overflow: 'hidden',
  }
}

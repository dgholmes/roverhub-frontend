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
 * Two layouts live here: `watchPanes` (the map and the camera side by side)
 * and `drivePanes` (the camera with the screen, the map an inset) -- which is
 * why `PaneGeometry` carries more than `watchPanes` reads. Which of the two a
 * body gets is decided by `operatorHoldsControl(robot)` and nothing else
 * (design §7.2.3): holding control means driving.
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

/* ── Driving ─────────────────────────────────────────────────────────────── */

/** The landscape map inset, 150 x 96 (design §7.2.3). Big enough to answer
 * "where am I" off a surveyed floorplan, small enough that the camera keeps
 * the screen. */
export const DRIVE_INSET_WIDTH = 150
export const DRIVE_INSET_HEIGHT = 96

/** How far the inset sits off the body's top-left corner. Flush would read as
 * a rendering fault rather than as a deliberate picture-in-picture. */
export const DRIVE_INSET_MARGIN = 12

/** The driving camera's native aspect, width : height. The feed is 4:3 and
 * portrait pins it at that rather than letterboxing it into a half-body. */
export const CAMERA_ASPECT = 4 / 3

/**
 * Where the panes go while the operator is driving.
 *
 * The two orientations are different layouts, not one scaled, so this is a
 * union on `orientation` rather than a pair of optional rects -- a caller that
 * forgets a case fails to compile instead of rendering an empty pane.
 *
 * - **Landscape** gives the camera everything and shrinks the map into the
 *   top-left corner. The inset is tappable to swap, which is the whole reason
 *   collapsing the map on Take control is cheap rather than a trap: pausing a
 *   mission is also a Take control, and the map is one tap away again.
 * - **Portrait** keeps both: the 4:3 feed pinned to the top at its own aspect,
 *   the map taking every pixel underneath.
 */
export type DrivePanes =
  | { orientation: 'landscape'; camera: Rect; mapInset: Rect }
  | { orientation: 'portrait'; camera: Rect; map: Rect }

export function drivePanes(o: PaneGeometry): DrivePanes {
  const { width, height } = o
  // Same rule as `watchPanes`: an unmeasured body yields nothing, never a
  // negative rect. The corner E-Stop is deliberately NOT sized from here --
  // it renders whether or not the body has been measured.
  if (width <= 0 || height <= 0) {
    return o.orientation === 'landscape'
      ? { orientation: 'landscape', camera: { ...EMPTY }, mapInset: { ...EMPTY } }
      : { orientation: 'portrait', camera: { ...EMPTY }, map: { ...EMPTY } }
  }

  if (o.orientation === 'landscape') {
    return {
      orientation: 'landscape',
      camera: { left: 0, top: 0, width, height },
      mapInset: {
        left: DRIVE_INSET_MARGIN,
        top: DRIVE_INSET_MARGIN,
        // Clamped only for a body too small to hold the inset at all, which no
        // device the design covers produces.
        width: Math.max(0, Math.min(DRIVE_INSET_WIDTH, width - DRIVE_INSET_MARGIN * 2)),
        height: Math.max(0, Math.min(DRIVE_INSET_HEIGHT, height - DRIVE_INSET_MARGIN * 2)),
      },
    }
  }

  // The feed at its native aspect, never taller than the body it is in.
  const cameraH = Math.min(Math.round(width / CAMERA_ASPECT), height)
  const rest = height - cameraH
  const gap = gapWithin(rest)
  return {
    orientation: 'portrait',
    camera: { left: 0, top: 0, width, height: cameraH },
    map: { left: 0, top: cameraH + gap, width, height: Math.max(0, rest - gap) },
  }
}

/** The corner E-Stop's box: 96 x 60 on a tablet, 72 x 44 on a phone
 * (design §7.2.5). */
export const CORNER_ESTOP_SIZE = {
  big: { width: 96, height: 60 },
  small: { width: 72, height: 44 },
} as const

export function cornerEstopSize(big: boolean): { width: number; height: number } {
  return big ? CORNER_ESTOP_SIZE.big : CORNER_ESTOP_SIZE.small
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

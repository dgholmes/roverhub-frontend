import type { FitPadding } from '@/components/liveops/map/FitToSite'

/** The most of one axis a single declared padding may consume. */
export const DEFAULT_PADDING_SHARE = 0.25

/**
 * Cut a declared fit padding back to a share of the pane it is fitted into.
 *
 * Callers keep declaring the regions their panels actually occlude --
 * MapFirstView's `topLeft: [300, 32]` is the telemetry card and
 * `bottomRight: [DOCK_WIDTH.sm + 40, 32]` the camera dock, and on a 1920 px
 * desktop both are returned untouched, because the route must not be fitted
 * underneath them. What this stops is the same declaration eating a 1024 px
 * pane, where 300 + 360 px of the 1024 would leave the site squeezed into the
 * middle third.
 *
 * Each side of each axis is clamped on its own: `min(declared, share * axis)`.
 * A pane that has not been laid out yet measures 0 x 0, and clamping to zero
 * there would fit the site edge-to-edge under the panels for a paint, so an
 * unmeasured axis is left alone.
 */
export function clampPadding(
  declared: FitPadding,
  size: { width: number; height: number },
  share: number = DEFAULT_PADDING_SHARE,
): FitPadding {
  const capX = size.width > 0 ? Math.floor(size.width * share) : Infinity
  const capY = size.height > 0 ? Math.floor(size.height * share) : Infinity
  const clamp = ([x, y]: [number, number]): [number, number] => [Math.min(x, capX), Math.min(y, capY)]
  return { topLeft: clamp(declared.topLeft), bottomRight: clamp(declared.bottomRight) }
}

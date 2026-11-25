import { memo, type ReactNode } from 'react'
import { Rectangle } from 'react-leaflet'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { boundsForFloor } from '@/liveops/mapFloor'
import { MapCaption } from './MapCaptions'
import type { SceneGrid } from '@/scene3d/types'
import type { MapFloor } from '@/types/maps'

/** Above this share of the grid surveyed, the rectangle is close enough to the
 * building that outlining it says nothing. Measured on the four stored maps on
 * 2026-11-25 the shares were 0.29, 0.24, 0.79 and 0.72, so in practice this
 * silences a map that has been trimmed, not any map we have. */
export const SURVEYED_SHARE_QUIET = 0.9

const round3 = (n: number) => Math.round(n * 1e3) / 1e3

/** How big the stored grid is, and how much of it the lidar never classified. */
export interface UnsurveyedExtent {
  /** The grid rectangle's width and height in metres, to the millimetre. */
  widthM: number
  heightM: number
  /** The content box's area as a fraction of the grid's, 0..1. */
  surveyedShare: number
  /** Whole percent of the rectangle outside the content box, rounded **down**
   * for the same reason `sparseSurveyPercent` rounds down: a number that
   * flatters the survey is worse than no number. */
  unsurveyedPercent: number
}

/**
 * Measure a floor's grid against the part of it that was surveyed.
 *
 * `SceneGrid.content` is the smallest box of cells with any bit set — the
 * building, in cells. The grid rectangle around it is whatever extent the
 * survey's trajectory happened to reach, including points later dropped: on the
 * active map the rectangle runs out to x = −43.9 m while no cell beyond
 * x = −5.9 m is classified, and the stored cloud reaches only −14.6 m. The
 * strays that stretched it are in no file we have. Only the rectangle survived
 * them, which is why this is a measurement and not a diagnosis.
 *
 * Both boxes are measured by **area**, not by span, so a content box that is
 * wide and short counts as little surveyed, which is what it is.
 */
export function unsurveyedExtent(grid: SceneGrid): UnsurveyedExtent {
  const { w, h, res, content } = grid
  const cells = w * h
  // A degenerate grid has nothing surveyed rather than an undefined share.
  const surveyedShare = cells > 0
    ? ((content.maxX - content.minX + 1) * (content.maxY - content.minY + 1)) / cells
    : 0
  return {
    widthM: round3(w * res),
    heightM: round3(h * res),
    surveyedShare,
    unsurveyedPercent: Math.floor((1 - surveyedShare) * 100),
  }
}

/**
 * The floor's whole stored grid, outlined, so that the black around the
 * building reads as "never surveyed" rather than as a broken map.
 *
 * Opt-in and off by default: on a map that was trimmed there is nothing to
 * explain, and this layer says so by drawing nothing at all (see
 * `SURVEYED_SHARE_QUIET`). Where it does draw, it is a dashed muted outline
 * with no fill and no pointer events — the operator is looking at the map
 * through it, and it must never swallow a tap meant for a nav goal.
 *
 * The caption is supplied by the caller rather than translated here, so that
 * the i18n keys stay in one place. Pass a function to receive the measured
 * extent for interpolation; `unsurveyedExtent` is exported for a caller that
 * would rather compute the numbers itself.
 *
 * Memoized for the same reason GridLayer and FloorplanLayer are: MapCanvas
 * re-renders on every telemetry frame, and neither the floor nor the grid
 * changes with one.
 */
export const UnsurveyedLayer = memo(function UnsurveyedLayer({ floor, grid, caption, captionHint }: {
  floor: MapFloor | undefined
  grid: SceneGrid
  /** The caption's first line, already translated, or a function of the
   * measured extent for a string with numbers in it. Absent means no caption. */
  caption?: string | ((extent: UnsurveyedExtent) => ReactNode)
  /** The quieter second line under it, already translated. */
  captionHint?: ReactNode
}) {
  const extent = unsurveyedExtent(grid)
  if (!floor) return null
  if (extent.surveyedShare > SURVEYED_SHARE_QUIET) return null

  const line = typeof caption === 'function' ? caption(extent) : caption

  return (
    <>
      <Rectangle
        bounds={boundsForFloor(floor)}
        interactive={false}
        pathOptions={{ color: color.t3, weight: 1, dashArray: '6 6', fill: false, interactive: false }}
      />
      {line != null && (
        // Placed by the map's caption column (MapCaptions), which stacks this
        // above FloorplanLayer's walkable / survey notice whatever either of
        // them measures. No border: the house style separates a card with a
        // tint and a dot, never a hairline.
        <MapCaption><div
          role="status"
          style={{
            ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
            pointerEvents: 'none',
            display: 'flex', alignItems: 'flex-start', gap: space[2],
            padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
            fontFamily: font.family, maxWidth: 260,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.t3, flexShrink: 0, marginTop: 4 }} />
          <span>
            <span style={{ display: 'block', fontSize: font.size.md, fontWeight: 600, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
              {line}
            </span>
            {captionHint != null && (
              <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2 }}>{captionHint}</span>
            )}
          </span>
        </div></MapCaption>
      )}
    </>
  )
})

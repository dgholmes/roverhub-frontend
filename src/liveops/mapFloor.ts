import type { LatLngBoundsLiteral } from 'leaflet'
import type { MapFloor } from '@/types/maps'
import { surveyedFraction } from '@/types/maps'

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Where a floor's grid sits on the canvas: `origin_xy_m` to
 * `origin + size_cells * resolution_m`, in metres. CRS.Simple takes metres
 * directly as `[y, x]`, so these are the overlay's corners as they are.
 * Rounded to a micrometre to shed float noise (`-17.8671 + 24` is not exactly
 * `6.1329`); a cell is 5 cm. Re-exported from MapCanvas. */
export function boundsForFloor(floor: MapFloor): LatLngBoundsLiteral {
  const [x0, y0] = floor.origin_xy_m
  const [w, h] = floor.size_cells
  return [
    [round6(y0), round6(x0)],
    [round6(y0 + h * floor.resolution_m), round6(x0 + w * floor.resolution_m)],
  ]
}

/** Below this share, a floor is too thinly surveyed to plan across unwarned. */
export const SPARSE_SURVEY_FRACTION = 0.5

/** Whole percent of the floor the lidar classified, or null when that is
 * enough to draw without comment. Rounds down: 13.9% reads as 13%, because a
 * caption that flatters the survey is worse than none. */
export function sparseSurveyPercent(floor: MapFloor): number | null {
  const fraction = surveyedFraction(floor)
  return fraction < SPARSE_SURVEY_FRACTION ? Math.floor(fraction * 100) : null
}

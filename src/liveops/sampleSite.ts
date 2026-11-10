import type { MapZone } from '@/types/maps'

/** An operator's note pinned on the site map, such as a hazard. There is no
 * backend schema or store for these yet, so only the mock provider has any. */
export interface SiteAnnotation {
  id: string
  x_m: number
  y_m: number
  note: string
}

/**
 * A made-up site that the provider supplies for the map to draw where nothing
 * real exists: a perimeter and no-go zones for canvases with no surveyed map
 * (given as `MapZone`s, so the zone layers draw them as they draw a survey's),
 * and hazard pins. The mock provider answers its sample site. The real one
 * answers NO_SAMPLE_SITE, so with the real backend the map shows only real
 * things. On a robot that walks by itself, a drawn boundary that nothing
 * enforces, or a hazard nobody placed, is a confidently wrong safety overlay.
 *
 * Both answers keep their identity between calls: the zone layers are
 * memoized on it, and their callers re-render on every telemetry frame.
 */
export interface SampleSite {
  zones: readonly MapZone[]
  annotations: readonly SiteAnnotation[]
}

export const NO_SAMPLE_SITE: SampleSite = Object.freeze({ zones: [], annotations: [] })

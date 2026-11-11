import type { MapZone, Point2D, SiteMap, ZoneKind } from '@/types/maps'

/**
 * The maths behind the zone editor, kept out of the component so it can be
 * tested without a map. Every coordinate is in the map frame, in metres, as
 * `[x, y]`.
 */

/** `MapZone` refuses fewer (shared/schemas/maps.py). */
export const MIN_ZONE_VERTICES = 3

/** Two vertices closer than this are one. A double-click is two clicks on the
 * same pixel, and a pixel is a few millimetres at the zooms the editor allows. */
const SAME_VERTEX_M = 0.01

/** Below this a polygon is a line that happens to have three points. */
const MIN_AREA_M2 = 1e-4

const toMillimetres = (v: number) => Math.round(v * 1000) / 1000

const sameVertex = (a: Point2D, b: Point2D) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < SAME_VERTEX_M

/** A Leaflet position as map metres. CRS.Simple makes `lat` the y axis and
 * `lng` the x axis (see `toLatLng`), so this is `[lng, lat]` -- the order that
 * reads naturally the wrong way round. Rounded to a millimetre: the position
 * comes from a pixel, and the noise below that is not information. */
export function latLngToMapMetres(position: { lat: number; lng: number }): Point2D {
  return [toMillimetres(position.lng), toMillimetres(position.lat)]
}

/** The vertices plus one more. Never mutates, and ignores a point that is not a
 * finite number (a stored zone with NaN in it is refused by the backend). */
export function addVertex(points: readonly Point2D[], point: Point2D): Point2D[] {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return [...points]
  return [...points, point]
}

/** The polygon the clicks describe, or null while it is not one. A double-click
 * is click, click, dblclick, so the last vertex arrives twice; one that comes
 * back to the first is the operator closing the shape by hand. Both are dropped
 * rather than counted as corners. */
export function closePolygon(points: readonly Point2D[]): Point2D[] | null {
  const out: Point2D[] = []
  for (const p of points) {
    if (out.length > 0 && sameVertex(out[out.length - 1], p)) continue
    out.push(p)
  }
  while (out.length > 1 && sameVertex(out[out.length - 1], out[0])) out.pop()
  return out.length >= MIN_ZONE_VERTICES ? out : null
}

export type PolygonProblem = 'tooFewVertices' | 'noArea' | 'selfIntersecting'

/** Twice the signed area (shoelace). */
function area2(points: readonly Point2D[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum
}

const cross = (o: Point2D, a: Point2D, b: Point2D) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Whether segments ab and cd cross at a point interior to both. Sharing an end
 * point does not count: adjacent edges always do. */
function crosses(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** What is wrong with a closed polygon, or null. A bow-tie is not a region: a
 * no-go zone that crosses itself leaves the middle ambiguous. */
export function polygonProblem(points: readonly Point2D[]): PolygonProblem | null {
  if (points.length < MIN_ZONE_VERTICES) return 'tooFewVertices'
  const n = points.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Edges that share a vertex (neighbours, including last-and-first) touch
      // by construction.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (crosses(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return 'selfIntersecting'
    }
  }
  // After the crossing check, not before: a symmetric bow-tie's two lobes cancel
  // in the shoelace sum and would read as having no area.
  if (Math.abs(area2(points)) / 2 < MIN_AREA_M2) return 'noArea'
  return null
}

/** Whether any vertex of the zone lies outside the map's surveyed extent. Zones
 * are drawn in the frame of the survey they were drawn on, so after a re-survey
 * one can land outside the new one. The editor flags it; it never deletes it. */
export function zoneOutOfBounds(zone: Pick<MapZone, 'polygon'>, map: Pick<SiteMap, 'extent_min' | 'extent_max'>): boolean {
  const [x0, y0] = map.extent_min
  const [x1, y1] = map.extent_max
  return zone.polygon.some(([x, y]) => x < x0 || x > x1 || y < y0 || y > y1)
}

export type ActivationProblem = 'noFloors' | 'alreadyActive'

/** Why a map cannot be frozen now, or null. Mirrors the backend, which refuses
 * a map with no floors (there would be nothing for a mission to plan on). */
export function activationProblem(map: Pick<SiteMap, 'floors' | 'status'>): ActivationProblem | null {
  if (map.floors.length === 0) return 'noFloors'
  if (map.status === 'active') return 'alreadyActive'
  return null
}

const MINTED_ID = /^zone-(\d+)$/

/** An id for a new zone: past the highest one already minted here, so deleting
 * a zone never lets a later one reuse its id. Ids need only be unique within a
 * map (the backend refuses a repeat). */
export function nextZoneId(existing: readonly Pick<MapZone, 'zone_id'>[]): string {
  let highest = 0
  for (const z of existing) {
    const match = MINTED_ID.exec(z.zone_id)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `zone-${highest + 1}`
}

const KIND_NAME: Record<ZoneKind, string> = { no_go: 'No-go', geofence: 'Geofence', stairs: 'Stairs' }

/** "No-go 2": a zone drawn with no label still needs one to be told apart in
 * the list. Not translated -- it is stored with the zone. */
export function defaultLabel(kind: ZoneKind, existing: readonly Pick<MapZone, 'kind'>[]): string {
  return `${KIND_NAME[kind]} ${existing.filter((z) => z.kind === kind).length + 1}`
}

/** A zone from a drawn shape, or the reason it cannot be one. */
export function buildZone(args: {
  mapId: string
  kind: ZoneKind
  label: string
  points: readonly Point2D[]
  existing: readonly MapZone[]
}): { zone: MapZone } | { problem: PolygonProblem } {
  const polygon = closePolygon(args.points)
  if (polygon === null) return { problem: 'tooFewVertices' }
  const problem = polygonProblem(polygon)
  if (problem) return { problem }
  return {
    zone: {
      zone_id: nextZoneId(args.existing),
      map_id: args.mapId,
      kind: args.kind,
      label: args.label.trim() || defaultLabel(args.kind, args.existing),
      polygon,
    },
  }
}

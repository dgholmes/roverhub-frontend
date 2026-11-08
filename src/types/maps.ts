/**
 * Mirrors shared/schemas/maps.py. Hand-maintained -- change both together.
 * `src/missions/missionTasks.test.ts` reads that file and fails on drift.
 *
 * All map coordinates are in the site's `map` frame, in metres, not the
 * robot's odom frame.
 */

/** A map is surveyed as a draft, reviewed, then activated; missions are planned
 *  only against an active one. */
export const MAP_STATUSES = ['draft', 'active', 'archived'] as const
export type MapStatus = typeof MAP_STATUSES[number]

export type MapSource = 'manual' | 'slam'
export type ZoneKind = 'no_go' | 'geofence'
export type Point2D = [number, number]

export interface GeodeticAnchor {
  latitude_deg: number
  longitude_deg: number
  epsg: number
}

/** One polygon in the map frame. */
export interface MapZone {
  zone_id: string
  map_id: string
  kind: ZoneKind
  label: string
  polygon: Point2D[]
}

/** One surveyed floor. `origin_xy_m` is the map-frame position of the grid's
 *  lower-left corner and `size_cells` is `[width, height]`. */
export interface MapFloor {
  index: number
  label: string | null
  floor_z_m: number
  resolution_m: number
  origin_xy_m: Point2D
  size_cells: [number, number]
  free_cells: number
  occupied_cells: number
  unknown_cells: number
}

/** The share of a floor's grid the lidar actually classified. Mirrors
 *  `MapFloor.surveyed_fraction` -- a property on the Python side, so it is not
 *  on the wire. Unknown cells are never-seen, not empty; 0 for an empty grid. */
export function surveyedFraction(floor: Pick<MapFloor, 'free_cells' | 'occupied_cells' | 'unknown_cells'>): number {
  const seen = floor.free_cells + floor.occupied_cells
  const total = seen + floor.unknown_cells
  return total > 0 ? seen / total : 0
}

export interface SiteMap {
  map_id: string
  site_id: string
  name: string
  source: MapSource
  extent_min: Point2D
  extent_max: Point2D
  created_at: string
  updated_at: string
  geodetic_anchor: GeodeticAnchor | null
  floors: MapFloor[]
  status: MapStatus
  zones: MapZone[]
}

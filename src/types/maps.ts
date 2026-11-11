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

/** A floor's planning grid: the one Nav2 plans on, beside the survey's grid,
 *  in exactly the floor's frame, origin, size and resolution (schema 0.0.17).
 *  A cell is walkable when it is free and at least `clearance_m` from every
 *  cell that is not -- see liveops/walkable.ts. */
export interface PlanningGrid {
  free_cells: number
  occupied_cells: number
  unknown_cells: number
  clearance_m: number
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
  /** 0.0.17. Null (or absent, from an older backend) when no planning grid is
   *  stored for this floor. */
  planning?: PlanningGrid | null
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

/** The files stored per floor (`GET /maps/{id}/floors/{index}/{kind}`): the
 *  occupancy grid, a rendered preview image, the point cloud, and (0.0.17) the
 *  planning grid, a P5 PGM the size of `grid` that answers 404 when the floor
 *  has none. Console only -- the backend validates the same names. */
export type MapArtifactKind = 'grid' | 'preview' | 'cloud' | 'planning'

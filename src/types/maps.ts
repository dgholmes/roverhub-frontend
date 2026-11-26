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
/** `stairs` (0.0.21): a flight of stairs. Walking treats it as no-go; only a
 *  Stairs mission step crosses it. */
export const ZONE_KINDS = ['no_go', 'geofence', 'stairs'] as const
export type ZoneKind = typeof ZONE_KINDS[number]
export type Point2D = [number, number]

export interface GeodeticAnchor {
  latitude_deg: number
  longitude_deg: number
  epsg: number
}

/** A flight's landings (shared StairsGeometry, 0.0.21): where the robot stands
 *  before climbing (bottom) or descending (top), outside the zone's polygon.
 *  `length_m` is a tape-measured walk length (null: the landings' distance);
 *  the floors are MapFloor indexes, null when the map has none yet. */
export interface StairsGeometry {
  bottom_xy_m: Point2D
  top_xy_m: Point2D
  length_m?: number | null
  lower_floor?: number | null
  upper_floor?: number | null
}

/** One polygon in the map frame. */
export interface MapZone {
  zone_id: string
  map_id: string
  kind: ZoneKind
  label: string
  polygon: Point2D[]
  /** 0.0.21. Set on a `stairs` zone, absent or null on any other. */
  stairs?: StairsGeometry | null
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
  /** 0.0.20. sha256 (hex) of what a robot needs to run on this floor as the
   *  console shows it: the localisation grid, the planning grid and the map's
   *  zones (shared/schemas/map_hash.py). The backend computes it; NAV_GOTO and
   *  RESET_POSITION send it as `map_hash`, and the bridge refuses a walk planned
   *  on another version. Null or absent from an older backend. */
  content_hash?: string | null
  /** 0.0.33. Where Return home walks to on this floor; null (or absent, from
   *  an older backend) until someone sets it on the Map page. Not part of
   *  `content_hash`: RETURN carries the pose, so moving home never means
   *  sending the map to the robot again. */
  home?: MapHome | null
}

/** Mirrors shared/schemas/maps.py's MapHome (0.0.33): where Return home goes,
 *  in the map frame. The backend checks it is on the walked area with room to
 *  turn, and stamps `set_at` / `set_by` itself. */
export interface MapHome {
  x_m: number
  y_m: number
  /** Heading on arrival, radians anticlockwise from the map's +x axis. */
  yaw_rad: number
  /** ISO 8601 UTC. */
  set_at: string
  set_by?: string | null
}

/** What PUT /maps/{id}/floors/{index}/home takes: the pose alone. */
export type MapHomePose = Pick<MapHome, 'x_m' | 'y_m' | 'yaw_rad'>

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
  /** Someone looked at the zones before activating, possibly deciding none
   * are needed (0.0.29): when (ISO time) and who (the signed-in user). Null or
   * absent on a map nobody reviewed, or one stored before 0.0.29. */
  zones_reviewed_at?: string | null
  zones_reviewed_by?: string | null
}

/** What `PATCH /maps/{id}` renames (0.0.29): the map, floor labels, or both.
 *  Labels are outside the content hash (shared/schemas/map_hash.py), so a
 *  rename never asks a robot to sync. A null label clears it. */
export interface MapRename {
  name?: string
  floors?: { index: number; label: string | null }[]
}

/** The longest floor label the backend stores (StartSurveyParams.floor_label). */
export const MAX_FLOOR_LABEL_CHARS = 40

/** The files stored per floor (`GET /maps/{id}/floors/{index}/{kind}`): the
 *  occupancy grid, a rendered preview image, the point cloud, and (0.0.17) the
 *  planning grid, a P5 PGM the size of `grid` that answers 404 when the floor
 *  has none. Console only -- the backend validates the same names. */
export type MapArtifactKind = 'grid' | 'preview' | 'cloud' | 'planning'

/** SYNC_MAP's params (schema 0.0.26, shared/schemas/commands.py
 *  SyncMapParams): "make the robot's map this floor of this map, exactly this
 *  version". `map_hash` is the floor's `content_hash`; the bridge builds the
 *  files, hashes them, and replaces nothing unless they hash to exactly this.
 *  Sent from Missions › Maps' "Robot maps" (Send to robot). */
export interface SyncMapParams {
  map_id: string
  floor_index?: number
  map_hash: string
}

/** USE_NAV_MAP's params (schema 0.0.29, shared/schemas/commands.py
 *  UseNavMapParams): "make this floor of this map the one the robot localises
 *  and plans on" -- on any robot, including one on another map or none. Unlike
 *  SYNC_MAP it changes WHICH map the robot is set up for: the bridge builds the
 *  floor's files, checks they hash to `map_hash`, restarts its nav stack, and
 *  acks `relocalise` (the robot must then be placed with Set position). */
export interface UseNavMapParams {
  map_id: string
  /** 0-50. */
  floor_index?: number
  map_hash: string
}

/** Mirrors `SyncMapPart`: what a sync replaced on the robot. */
export const SYNC_MAP_PARTS = ['planning', 'localisation', 'zones'] as const
export type SyncMapPart = typeof SYNC_MAP_PARTS[number]

/** Mirrors `SyncMapResult`, the ack's `result` on success: the hash the device
 *  now runs on, which parts changed, and `relocalise` when the localisation
 *  grid changed (the robot needs Set position again). */
export interface SyncMapResult {
  map_hash: string
  changed?: SyncMapPart[]
  relocalise?: boolean
}

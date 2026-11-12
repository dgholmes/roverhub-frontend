/**
 * The map scene's shared contract: what the data layer produces and what the
 * engine and the React wrappers consume. Ported from the map options page
 * (docs/superpowers/specs/2026-11-12-map-scene-plan-fly-follow-design.md).
 *
 * Coordinates are always map-frame metres (x east, y north). Heights are
 * metres above the floor (`floor_z_m`), never raw map z.
 */

/** Grid cell bits, as the options page's data builder wrote them. */
export const GRID_WALKABLE = 1   // planning grid says free (254)
export const GRID_WALL = 2       // structure grid says occupied (0)
export const GRID_FURNITURE = 4  // planning occupied where structure is not
export const GRID_KNOWN = 8      // either grid is not unknown (205)

/** Point classes: floor, furniture band, wall or tall, ceiling. */
export const CLS_FLOOR = 0
export const CLS_FURNITURE = 1
export const CLS_WALL = 2
export const CLS_CEILING = 3

export interface SceneGrid {
  /** Cells across (x) and up (y). */
  w: number
  h: number
  /** Metres per cell. */
  res: number
  /** Map-frame position of cell (0, 0)'s lower-left corner. */
  origin: [number, number]
  /** w*h bytes of GRID_* bits, row-major, row 0 = LOWEST y (unlike a PGM). */
  bits: Uint8Array
  /** The smallest box of cells with any bit set, for framing the camera. */
  content: { minX: number; minY: number; maxX: number; maxY: number }
}

export interface SceneCloud {
  count: number
  /** count*3 floats: map x, map y, height above the floor. Shuffled, so any
   * prefix is a uniform sample. */
  xyh: Float32Array
  /** count bytes of CLS_*. */
  cls: Uint8Array
}

export interface SceneData {
  mapId: string
  floorIndex: number
  /** Map z of the floor; heights are relative to this. */
  floorZ: number
  grid: SceneGrid
  /** Null when the map has no cloud: Plan works, Fly and Follow do not. */
  cloud: SceneCloud | null
  /** True when the planning grid was present (walkable and furniture bits). */
  hasPlanning: boolean
}

/** Resolved scene colours, as CSS colour strings, for one theme. */
export interface ScenePalette {
  bg: string
  floor: string
  wall: string
  furn: string
  grid: string
  track: string
  robot: string
  pointFloor: string
  pointFurn: string
  pointWall: string
  accent: string
  red: string
  amber: string
}

export type SceneView = 'plan' | 'fly' | 'follow'
export type CloudColouring = 'structure' | 'height'

/** Overlays the engine draws on top of the scene. All optional. */
export interface SceneRouteWaypoint {
  id: string
  x: number
  y: number
  label: string
  flag?: 'error' | 'warning'
  note?: string
}

export interface SceneRobotPose {
  x: number
  y: number
  /** Radians, counter-clockwise from +x (map frame). */
  yaw: number
  stale?: boolean
  estimated?: boolean
}

export interface SceneGoal {
  x: number
  y: number
  refused?: boolean
}

export interface SceneZone {
  id: string
  kind: 'no_go' | 'geofence' | 'stairs'
  /** Polygon in map metres. */
  points: [number, number][]
  label?: string
}

import i18n from '@/i18n'
import { cellAt, type CellClass, type GridPixels } from '@/missions/floorCells'
import { pointInPolygon } from '@/missions/geometry'
import type { MapFloor, MapZone, Point2D } from '@/types/maps'
import type { RobotPosition } from '@/types/robotState'

/**
 * What a tap on the LiveOps map means, and when to refuse it. Pure: the layer
 * that draws the marker and the command that sends it both read from here.
 *
 * Coordinates are map-frame metres (x right, y up); headings are radians
 * anticlockwise from +x, the wire's `yaw_rad`.
 */

type FloorGeometry = Pick<MapFloor, 'origin_xy_m' | 'resolution_m' | 'size_cells'>
type ZoneShape = Pick<MapZone, 'kind' | 'polygon' | 'label'>

/** What of the robot a goal needs: its position, which may be absent. */
export interface NavRobot { position?: RobotPosition | null }

export type NavGoalRefusalReason =
  | 'noPosition'        // the robot has not reported a position
  | 'positionNotOnMap'  // the position is not SLAM's: a goal would be walked in the wrong frame
  | 'positionLost'      // SLAM lost lock: driving on a stale pose is worse than standing still
  | 'outsideFloor'
  | 'inNoGo'
  | 'occupied'

export interface NavGoal {
  ok: true
  x_m: number
  y_m: number
  /** Radians anticlockwise from +x, or null for "any heading on arrival". */
  yaw_rad: number | null
  /** What the survey says is under the goal; `unknown` is accepted, not free. */
  cell: CellClass
  /** The map has geofences and the goal is inside none of them. */
  outsideGeofence: boolean
}

export interface NavGoalRefusal {
  ok: false
  reason: NavGoalRefusalReason
  /** The zone's label, for `inNoGo`. */
  zone?: string
}

/** Wire shape of `NavGotoParams` (shared/schemas/commands.py). */
export interface NavGotoParams {
  x_m: number
  y_m: number
  yaw_rad: number | null
  map_id: string
  floor_id: string
}

const toPoint = (p: Point2D) => ({ x_m: p[0], y_m: p[1] })

function insideFloor(floor: FloorGeometry, point: Point2D): boolean {
  const [w, h] = floor.size_cells
  const x = (point[0] - floor.origin_xy_m[0]) / floor.resolution_m
  const y = (point[1] - floor.origin_xy_m[1]) / floor.resolution_m
  return x >= 0 && x < w && y >= 0 && y < h
}

/** Ground nobody classified is `unknown`; so is ground whose grid is not loaded. */
function cellOf(floor: FloorGeometry, grid: GridPixels | null | undefined, point: Point2D): CellClass {
  return grid ? cellAt(floor, grid, point) : 'unknown'
}

/**
 * The goal a tap makes, or why not.
 *
 * Refused: no robot position, a position that is not SLAM's, a lost SLAM
 * position, outside the floor, inside a no-go zone, on an occupied cell.
 *
 * NOT refused: unknown ground. 86% of a one-pass survey is unknown, so refusing
 * it would make the feature useless; the goal is accepted with a warning and
 * the costmap is what stops the robot at a wall it has not seen.
 *
 * A geofence is not a refusal either: the missions validator warns for a
 * waypoint outside every geofence (`outsideSite`), and a goal is the same kind
 * of point, so it is accepted with a warning. (A no-go zone, by contrast, is an
 * error in missions and a refusal here.)
 *
 * `quality: 'estimated'` is accepted: AMCL reports it while converging, and the
 * operator's tap is often what starts it. Only `lost` refuses.
 */
export function navGoalFrom(
  point: Point2D,
  floor: FloorGeometry,
  grid: GridPixels | null | undefined,
  robot: NavRobot | null | undefined,
  zones: readonly ZoneShape[] = [],
  yaw_rad: number | null = null,
): NavGoal | NavGoalRefusal {
  const position = robot?.position
  if (!position) return { ok: false, reason: 'noPosition' }
  if (position.provider !== 'slam') return { ok: false, reason: 'positionNotOnMap' }
  if (position.quality === 'lost') return { ok: false, reason: 'positionLost' }

  if (!insideFloor(floor, point)) return { ok: false, reason: 'outsideFloor' }
  const p = toPoint(point)
  const noGo = zones.find((z) => z.kind === 'no_go' && pointInPolygon(p, z.polygon.map(toPoint)))
  if (noGo) return { ok: false, reason: 'inNoGo', zone: noGo.label }
  const cell = cellOf(floor, grid, point)
  if (cell === 'occupied') return { ok: false, reason: 'occupied' }

  const fences = zones.filter((z) => z.kind === 'geofence')
  const outsideGeofence = fences.length > 0 && !fences.some((z) => pointInPolygon(p, z.polygon.map(toPoint)))
  return { ok: true, x_m: point[0], y_m: point[1], yaw_rad, cell, outsideGeofence }
}

export type NavWarningKey = 'liveops.nav.warnOutsideGeofence' | 'liveops.nav.warnUnknownGround'

/** Every caution a goal earns, most serious first. */
export function navGoalWarnings(goal: Pick<NavGoal, 'cell' | 'outsideGeofence'>): NavWarningKey[] {
  const out: NavWarningKey[] = []
  if (goal.outsideGeofence) out.push('liveops.nav.warnOutsideGeofence')
  if (goal.cell === 'unknown') out.push('liveops.nav.warnUnknownGround')
  return out
}

/** The one caution to show: a translation key, or null for a clean goal. */
export function navGoalWarning(goal: Pick<NavGoal, 'cell' | 'outsideGeofence'>): NavWarningKey | null {
  return navGoalWarnings(goal)[0] ?? null
}

export type InitialPoseRefusalReason = 'outsideFloor' | 'occupied'

export interface InitialPose {
  ok: true
  x_m: number
  y_m: number
  /** Radians anticlockwise from +x; null when the operator did not drag. */
  yaw_rad: number | null
}
export interface InitialPoseRefusal {
  ok: false
  reason: InitialPoseRefusalReason
}

/** The translation key for a refusal's reason. */
export function navRefusalKey(reason: NavGoalRefusalReason): `liveops.nav.refuse.${NavGoalRefusalReason}` {
  return `liveops.nav.refuse.${reason}`
}

/** A refusal in the operator's language. */
export function navRefusalText(refusal: NavGoalRefusal | InitialPoseRefusal): string {
  // A cast, not a typed call: the key is a union and only one member takes {{zone}}.
  const t = i18n.t as (key: string, options: { zone: string }) => string
  return t(navRefusalKey(refusal.reason), { zone: 'zone' in refusal && refusal.zone ? refusal.zone : '' })
}

/** The body of a NAV_GOTO command. */
export function navGotoParams(goal: Pick<NavGoal, 'x_m' | 'y_m' | 'yaw_rad'>, mapId: string, floorId: string): NavGotoParams {
  return { x_m: goal.x_m, y_m: goal.y_m, yaw_rad: goal.yaw_rad, map_id: mapId, floor_id: floorId }
}

/** A drag shorter than this (metres) is a tap that wobbled, not a heading. */
export const MIN_HEADING_DRAG_M = 0.05

/**
 * The initial pose a tap-and-drag makes: where the robot actually is, and
 * (from the drag) which way it faces. It is a statement of fact, so it is
 * refused only where a robot cannot stand: outside the floor, or inside a wall.
 * Never on unknown ground (the robot is there), never in a no-go zone, and never
 * on the robot's position quality, because setting the pose is how that recovers.
 *
 * With no real drag the heading is null: the caller must get one before it
 * sends, since AMCL needs it.
 */
export function initialPoseFrom(
  point: Point2D,
  headingPoint: Point2D | null | undefined,
  floor: FloorGeometry,
  grid: GridPixels | null | undefined,
): InitialPose | InitialPoseRefusal {
  if (!insideFloor(floor, point)) return { ok: false, reason: 'outsideFloor' }
  if (cellOf(floor, grid, point) === 'occupied') return { ok: false, reason: 'occupied' }
  let yaw_rad: number | null = null
  if (headingPoint) {
    const dx = headingPoint[0] - point[0], dy = headingPoint[1] - point[1]
    if (Math.hypot(dx, dy) >= MIN_HEADING_DRAG_M) yaw_rad = Math.atan2(dy, dx)
  }
  return { ok: true, x_m: point[0], y_m: point[1], yaw_rad }
}

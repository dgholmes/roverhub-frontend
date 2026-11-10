import i18n from '@/i18n'
import { cellAt, type CellClass, type GridPixels } from '@/missions/floorCells'
import { pointInPolygon } from '@/missions/geometry'
import type { MapFloor, MapZone, Point2D } from '@/types/maps'
import type { NavGoalState, NavGoalStatus, RobotPosition } from '@/types/robotState'

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

/** Wire shape of `ResetPositionParams` (shared/schemas/commands.py): where the
 * robot stands. `heading_deg` is DEGREES anticlockwise from +x, as on
 * RobotPosition -- not the radians the drag produces -- and it is required. */
export interface ResetPositionParams {
  x_m: number
  y_m: number
  heading_deg: number
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

/** Why the robot cannot be sent anywhere on the map yet, or null when it can:
 * no position, a position that is not SLAM's (a goal would be walked in the
 * wrong frame), or a SLAM position that lost lock. `estimated` is fine: AMCL
 * reports it while converging. Each of these is fixed by Set position. */
export function robotPlacementProblem(
  robot: NavRobot | null | undefined,
): 'noPosition' | 'positionNotOnMap' | 'positionLost' | null {
  const position = robot?.position
  if (!position) return 'noPosition'
  if (position.provider !== 'slam') return 'positionNotOnMap'
  if (position.quality === 'lost') return 'positionLost'
  return null
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
  const placement = robotPlacementProblem(robot)
  if (placement) return { ok: false, reason: placement }

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

/** The body of a NAV_GOTO command. Throws RangeError on a non-finite point or
 * yaw rather than send one: the wire refuses NaN, and Infinity is no heading.
 * A null yaw ("any heading on arrival") is fine. */
export function navGotoParams(goal: Pick<NavGoal, 'x_m' | 'y_m' | 'yaw_rad'>, mapId: string, floorId: string): NavGotoParams {
  if (!Number.isFinite(goal.x_m) || !Number.isFinite(goal.y_m)) throw new RangeError('NAV_GOTO needs a finite point')
  if (goal.yaw_rad !== null && !Number.isFinite(goal.yaw_rad)) throw new RangeError('NAV_GOTO yaw_rad must be finite or null')
  return { x_m: goal.x_m, y_m: goal.y_m, yaw_rad: goal.yaw_rad, map_id: mapId, floor_id: floorId }
}

/** The body of a RESET_POSITION command, or null when the pose has no heading
 * yet (the operator must drag, since localisation cannot be seeded without
 * one). Converts the drag's radians to the wire's degrees. */
export function resetPositionParams(pose: InitialPose, mapId: string, floorId: string): ResetPositionParams | null {
  if (pose.yaw_rad === null || !Number.isFinite(pose.yaw_rad)) return null
  if (!Number.isFinite(pose.x_m) || !Number.isFinite(pose.y_m)) return null
  return { x_m: pose.x_m, y_m: pose.y_m, heading_deg: (pose.yaw_rad * 180) / Math.PI, map_id: mapId, floor_id: floorId }
}

const NAV_GOAL_STATES: ReadonlySet<NavGoalState> = new Set(['active', 'succeeded', 'aborted', 'canceled', 'refused'])

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** `nav_goal` as it may be used, or null. It arrives from MQTT unvalidated, so
 * a status whose state is not one of the five, whose point is not finite, or
 * that names no goal is dropped rather than drawn or reported. */
export function readNavGoal(raw: unknown): NavGoalStatus | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const g = raw as Record<string, unknown>
  if (typeof g.goal_id !== 'string' || !NAV_GOAL_STATES.has(g.state as NavGoalState)) return null
  if (!finite(g.x_m) || !finite(g.y_m)) return null
  return {
    goal_id: g.goal_id,
    x_m: g.x_m,
    y_m: g.y_m,
    yaw_rad: finite(g.yaw_rad) ? g.yaw_rad : null,
    map_id: typeof g.map_id === 'string' ? g.map_id : '',
    state: g.state as NavGoalState,
    reason: typeof g.reason === 'string' ? g.reason : null,
    updated_at: typeof g.updated_at === 'string' ? g.updated_at : '',
  }
}

/** The bridge's stop reasons this build words (nav_goals.py, nav_supervisor.py,
 * command_sender.py). Several arrive with a detail after a colon
 * (`joy_unusable: remote active`, `supervisor_error: ...`, `scan_stale: lidar`,
 * `in_no_go_zone: <zone label>`, `zones_not_loaded: <why>`); the head picks the
 * words, and for /joy the detail refines them. No other detail is shown. */
type StopReasonKey =
  | 'localizationLost' | 'estop' | 'operatorTookControl' | 'batteryCritical' | 'batteryUnknown'
  | 'remoteActive' | 'notStanding' | 'joyUnusable' | 'supervisorError' | 'plannerAborted' | 'plannerSilent'
  | 'plannerCanceled' | 'plannerRejected' | 'superseded' | 'operator' | 'releaseControl' | 'bridgeStopping'
  | 'navUnavailable' | 'scanStale' | 'inNoGoZone' | 'outsideSiteBoundary' | 'zonesNotLoaded'

const STOP_REASONS: Record<string, StopReasonKey> = {
  localization_lost: 'localizationLost',
  estop: 'estop',
  operator_has_control: 'operatorTookControl',
  operator_took_control: 'operatorTookControl',
  battery_critical: 'batteryCritical',
  battery_unknown: 'batteryUnknown',
  joy_unusable: 'joyUnusable',
  supervisor_error: 'supervisorError',
  nav2_aborted: 'plannerAborted',
  nav2_silent: 'plannerSilent',
  nav2_canceled: 'plannerCanceled',
  nav2_rejected: 'plannerRejected',
  superseded: 'superseded',
  operator: 'operator',
  release_control: 'releaseControl',
  bridge_stopping: 'bridgeStopping',
  nav_link: 'navUnavailable',
  scan_stale: 'scanStale',
  in_no_go_zone: 'inNoGoZone',
  outside_geofence: 'outsideSiteBoundary',
  zones_not_loaded: 'zonesNotLoaded',
}

function stopReasonKey(reason: string | null): StopReasonKey | null {
  if (!reason) return null
  const colon = reason.indexOf(':')
  const head = (colon < 0 ? reason : reason.slice(0, colon)).trim()
  const key = Object.prototype.hasOwnProperty.call(STOP_REASONS, head) ? STOP_REASONS[head] : null
  if (key !== 'joyUnusable') return key
  const detail = colon < 0 ? '' : reason.slice(colon + 1).trim()
  if (detail === 'remote active') return 'remoteActive'
  if (detail.startsWith('robot in ')) return 'notStanding'
  return 'joyUnusable'
}

export type NavOutcomeTone = 'green' | 'neutral' | 'red'

/** A finished goal in plain words for the bar: "Arrived", or "Stopped: <why>".
 * A reason this build does not know reads as a generic line for its state,
 * never as the raw string. Null while the goal is still walking. */
export function navGoalOutcome(goal: Pick<NavGoalStatus, 'state' | 'reason'>): { tone: NavOutcomeTone; text: string } | null {
  if (goal.state === 'active') return null
  if (goal.state === 'succeeded') return { tone: 'green', text: i18n.t('liveops.nav.ended.arrived') }
  const tone: NavOutcomeTone = goal.state === 'canceled' ? 'neutral' : 'red'
  const key = stopReasonKey(goal.reason)
  if (!key) return { tone, text: i18n.t(`liveops.nav.ended.generic.${goal.state}`) }
  return { tone, text: i18n.t('liveops.nav.ended.stopped', { reason: i18n.t(`liveops.nav.ended.reason.${key}`) }) }
}

/** Straight-line distance between two map points, metres. */
export function distanceM(a: { x_m: number; y_m: number }, b: { x_m: number; y_m: number }): number {
  return Math.hypot(b.x_m - a.x_m, b.y_m - a.y_m)
}

/** A distance as the bar shows it: one decimal under 10 m, whole metres above. */
export function formatDistanceM(m: number): string {
  return m < 10 ? m.toFixed(1) : String(Math.round(m))
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

import i18n from '@/i18n'
import type { GridPixels } from '@/missions/floorCells'
import type { CommandAvailability } from '@/types'
import type { MapFloor, Point2D } from '@/types/maps'
import type { NavGoalStatus, RobotPosition } from '@/types/robotState'
import {
  distanceM, formatDistanceM, formatSpeedMps, initialPoseFrom, navGoalOutcome, navGoalWarnings, navRefusalText, readNavGoal,
  resetPositionParams, robotPlacementProblem, type InitialPoseRefusalReason, type NavGoal, type NavGoalRefusal,
  type NavOutcomeTone, type ResetPositionParams,
} from './navGoal'
import type { NavNotice } from './navLocate'

/**
 * Tap-to-go on the LiveOps map, as plain state (option A, "Go mode button",
 * 2026-11-10): a small tool group of Go to point and Set position, one mode at
 * a time, and a bar at the bottom of the map that says what a tap means.
 * NavGoalLayer is a thin view over these; everything an operator can see here
 * is decided by a pure function and tested as one.
 */

export type NavMode = 'idle' | 'go' | 'setPosition'

/** Why a press-drag-release in Set position was not sent. */
export type PoseProblem = 'needDrag' | InitialPoseRefusalReason

export interface NavUiState {
  mode: NavMode
  /** Go mode: the tapped point waiting for Walk or Cancel. */
  pending: Point2D | null
  /** Set position: where the press landed and where the drag has reached. */
  pose: { at: Point2D; toward: Point2D } | null
  /** Set position: why the last release was not sent, until the next press. */
  poseProblem: PoseProblem | null
}

export const NAV_UI_IDLE: NavUiState = Object.freeze({ mode: 'idle', pending: null, pose: null, poseProblem: null }) as NavUiState

export type NavUiAction =
  /** A tool button. Pressing the active one again leaves the mode. */
  | { type: 'toggle'; mode: 'go' | 'setPosition' }
  /** Esc, a sent command, or a tool that stopped being usable. */
  | { type: 'exit' }
  | { type: 'tap'; point: Point2D }
  /** The bar's Cancel: drop the pin, stay in Go mode. */
  | { type: 'cancel' }
  | { type: 'press'; point: Point2D }
  | { type: 'drag'; point: Point2D }
  | { type: 'poseFailed'; problem: PoseProblem }

export function navUiReducer(state: NavUiState, action: NavUiAction): NavUiState {
  switch (action.type) {
    case 'toggle':
      return state.mode === action.mode ? NAV_UI_IDLE : { ...NAV_UI_IDLE, mode: action.mode }
    case 'exit':
      return NAV_UI_IDLE
    case 'tap':
      // Only Go mode makes a goal: a stray click elsewhere never does.
      return state.mode === 'go' ? { ...state, pending: action.point } : state
    case 'cancel':
      return state.mode === 'go' ? { ...state, pending: null } : state
    case 'press':
      return state.mode === 'setPosition' ? { ...state, pose: { at: action.point, toward: action.point }, poseProblem: null } : state
    case 'drag':
      return state.pose ? { ...state, pose: { ...state.pose, toward: action.point } } : state
    case 'poseFailed':
      return state.mode === 'setPosition' ? { ...state, pose: null, poseProblem: action.problem } : state
  }
}

type FloorGeometry = Pick<MapFloor, 'origin_xy_m' | 'resolution_m' | 'size_cells'>

/**
 * What a release in Set position sends: RESET_POSITION's params (heading in
 * degrees), or why not. A drag under 5 cm gives no heading, so the operator is
 * asked to drag rather than a pose being sent without one. Unsurveyed ground is
 * fine -- the robot is standing there.
 */
export function settlePose(
  at: Point2D, toward: Point2D | null, floor: FloorGeometry, grid: GridPixels | null | undefined,
  mapId: string, floorId: string,
): { ok: true; params: ResetPositionParams } | { ok: false; problem: PoseProblem } {
  const pose = initialPoseFrom(at, toward, floor, grid)
  if (!pose.ok) return { ok: false, problem: pose.reason }
  const params = resetPositionParams(pose, mapId, floorId)
  return params ? { ok: true, params } : { ok: false, problem: 'needDrag' }
}

/** The robot as the bar reads it. `nav_goal` is unvalidated wire data. */
export interface NavBarRobot {
  position: RobotPosition | null | undefined
  nav_goal: NavGoalStatus | null | undefined
}

export interface NavBarInput {
  ui: NavUiState
  robot: NavBarRobot
  /** `navGoalFrom` of `ui.pending`, or null with no pin. */
  goal: NavGoal | NavGoalRefusal | null
  /** NAV_GOTO's availability (commandPolicy): Walk is disabled with its reason. */
  walk: CommandAvailability
  /** A finished goal to show briefly (see navGoalEnded), or null. */
  ended: NavGoalStatus | null
  /** What the robot said back about a Set position or a walk (navLocate), or null. */
  notice?: NavNotice | null
  /** The top speed a Walk now would carry (walkSpeedMpsOf), shown beside the
   * distance; null or absent shows none. */
  walkSpeedMps?: number | null
}

export type NavBarModel =
  | { kind: 'none' }
  | { kind: 'walking'; title: string; detail: string | null }
  | { kind: 'confirm'; title: string; detail: string | null; warnings: string[]; walk: CommandAvailability }
  | { kind: 'refused'; text: string }
  | { kind: 'notPlaced'; text: string }
  | { kind: 'ended'; tone: NavOutcomeTone; text: string }
  | ({ kind: 'notice' } & NavNotice)

/** Metres from where the robot is to `to`, as the bar words it; null when the
 * robot's position is not on the map, where a distance would be fiction. */
function metresTo(position: RobotPosition | null | undefined, to: { x_m: number; y_m: number }): string | null {
  if (!position || robotPlacementProblem({ position })) return null
  return formatDistanceM(distanceM(position, to))
}

/** The goal the robot is walking to, read defensively, or null. */
export function activeNavGoal(robot: Pick<NavBarRobot, 'nav_goal'>): NavGoalStatus | null {
  const goal = readNavGoal(robot.nav_goal)
  return goal?.state === 'active' ? goal : null
}

/**
 * The bar at the bottom of the map, most important first:
 * 1. a goal walking: "Walking to goal", metres left, Stop;
 * 2. Go mode with the robot not placed: ask for Set position;
 * 3. Go mode with a pin: the refusal in place of Walk, or "Walk here" with the
 *    distance and the top speed the walk will carry (the Speed tier), every warning above the buttons (geofence first), and Walk
 *    disabled with the policy's reason when the robot would refuse it. The
 *    geofence warning is the only gate a geofence has: the bridge does not
 *    enforce them;
 * 4. what the lidar said about a Set position, or a walk refused because the
 *    robot is not sure where it is;
 * 5. a goal that just finished: "Arrived" or "Stopped: <why>".
 */
export function navBarModel({ ui, robot, goal, walk, ended, notice, walkSpeedMps = null }: NavBarInput): NavBarModel {
  const walking = activeNavGoal(robot)
  if (walking) {
    const left = metresTo(robot.position, walking)
    return { kind: 'walking', title: i18n.t('liveops.nav.walking'), detail: left === null ? null : i18n.t('liveops.nav.left', { distance: left }) }
  }
  if (ui.mode === 'go') {
    if (robotPlacementProblem(robot)) return { kind: 'notPlaced', text: i18n.t('liveops.nav.notPlaced') }
    if (ui.pending && goal) {
      if (!goal.ok) return { kind: 'refused', text: navRefusalText(goal) }
      const away = metresTo(robot.position, goal)
      const detail: string[] = []
      if (away !== null) detail.push(i18n.t('liveops.nav.away', { distance: away }))
      if (walkSpeedMps !== null) detail.push(i18n.t('liveops.nav.topSpeed', { speed: formatSpeedMps(walkSpeedMps) }))
      return {
        kind: 'confirm',
        title: i18n.t('liveops.nav.walkHere'),
        detail: detail.length ? detail.join(' · ') : null,
        warnings: navGoalWarnings(goal).map((key) => i18n.t(key)),
        walk,
      }
    }
  }
  if (notice) return { kind: 'notice', ...notice }
  const outcome = ended ? navGoalOutcome(ended) : null
  if (outcome) return { kind: 'ended', ...outcome }
  return { kind: 'none' }
}

export interface NavToolState {
  active: boolean
  enabled: boolean
  reason?: string
}

/** The two tool buttons. Both are off while a goal walks: Stop must stay in the
 * bar, a new tap would redirect the walk, and the bridge refuses a new
 * position mid-walk. Set position also carries RESET_POSITION's policy. */
export function navToolsModel({ ui, walking, setPosition }: {
  ui: NavUiState
  walking: boolean
  setPosition: CommandAvailability
}): { go: NavToolState; setPosition: NavToolState } {
  const busy = walking ? i18n.t('liveops.nav.busyWalking') : null
  const tool = (mode: 'go' | 'setPosition', policy: CommandAvailability): NavToolState => {
    const active = ui.mode === mode
    if (busy) return { active, enabled: false, reason: busy }
    if (!policy.enabled) return { active, enabled: false, reason: policy.reason }
    return { active, enabled: true }
  }
  return { go: tool('go', { enabled: true }), setPosition: tool('setPosition', setPosition) }
}

export type NavHint = { tone: 'muted' | 'amber' | 'red'; text: string } | null

/** The line under the tool group. In Go mode it is silent while the robot is
 * not placed, because the bar is asking for Set position instead. */
export function navHint(ui: NavUiState, placed: boolean): NavHint {
  if (ui.mode === 'go') return placed ? { tone: 'muted', text: i18n.t('liveops.nav.goHint') } : null
  if (ui.mode !== 'setPosition') return null
  if (ui.poseProblem === 'needDrag') return { tone: 'amber', text: i18n.t('liveops.nav.needDrag') }
  if (ui.poseProblem) return { tone: 'red', text: navRefusalText({ ok: false, reason: ui.poseProblem }) }
  return { tone: 'muted', text: i18n.t('liveops.nav.setPositionHint') }
}

/**
 * Whether `next` is a goal that has just finished and should be shown briefly.
 * `prev` is the status seen before it, or `undefined` on the first look --
 * which never counts, so a retained /state from hours ago does not announce
 * "Arrived" when the page loads. A goal counts when it was seen walking, or
 * when it is new and arrives already finished (refused at start).
 */
export function navGoalEnded(prev: NavGoalStatus | null | undefined, next: NavGoalStatus | null): boolean {
  if (prev === undefined || !next || next.state === 'active') return false
  if (!prev || prev.goal_id !== next.goal_id) return true
  return prev.state === 'active'
}

/** What the bar remembers about finished goals for one robot: the last status
 * seen (to judge the next one by), and the finished goal it is showing. */
export interface EndedTrack {
  robotId: string
  /** `goal_id/state` of `last`, so a repeat of the same status changes nothing. */
  key: string | null
  last: NavGoalStatus | null
  ended: NavGoalStatus | null
}

const statusKey = (goal: NavGoalStatus | null) => (goal ? `${goal.goal_id}/${goal.state}` : null)

/** The first look at a robot: nothing is shown, whatever its status says. */
export function initialEndedTrack(robotId: string, raw: unknown): EndedTrack {
  const goal = readNavGoal(raw)
  return { robotId, key: statusKey(goal), last: goal, ended: null }
}

/**
 * The next track after a /state, or the same object when nothing changed (so a
 * component can keep it in state and update it during render). Another robot
 * starts over; a goal that just ended is shown (navGoalEnded); a goal that
 * starts walking clears the note. The caller clears `ended` after a few
 * seconds.
 */
export function trackEnded(track: EndedTrack, robotId: string, raw: unknown): EndedTrack {
  if (track.robotId !== robotId) return initialEndedTrack(robotId, raw)
  const goal = readNavGoal(raw)
  const key = statusKey(goal)
  if (key === track.key) return track
  const ended = navGoalEnded(track.last, goal) ? goal : goal?.state === 'active' ? null : track.ended
  return { robotId, key, last: goal, ended }
}

/**
 * Whether a click's target is the map itself rather than a control floating
 * over it. A click on the floorplan lands on the map container -- the image is
 * not interactive, so the event falls through to it -- and a click on a marker
 * lands inside the map pane; both are the map. A control rendered inside the
 * container (floor picker, cloud toggle) is neither.
 *
 * 2026-11-10: checking only "inside the map pane" threw away every click on
 * the floor, so Go to point never placed a pin and Set position only counted
 * a press on the robot marker itself.
 */
export function isMapSurface(
  target: unknown,
  container: unknown,
  pane: { contains: (node: never) => boolean },
): boolean {
  if (target == null) return false
  return target === container || pane.contains(target as never)
}

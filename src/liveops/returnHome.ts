import i18n from '@/i18n'
import type { CommandAvailability, RobotState } from '@/types'
import type { MapFloor, SiteMap } from '@/types/maps'
import { getCommandAvailability } from './commandPolicy'
import { readNavGoal, robotPlacementProblem } from './navGoal'
import type { RobotRunView } from './robotRun'

/**
 * Return home (RETURN, schema 0.0.33): which home the button walks to, and
 * whether it can now.
 *
 * The home is always the one on the robot's OWN map and floor -- the map its
 * nav stack runs (`bridge.nav_map_id`) and the floor whose content hash its
 * files match (`bridge.nav_map_hash`) -- never the map or floor the page
 * happens to show. A console showing another map must not walk the robot to a
 * point in a frame it is not in (Review Focus 5).
 *
 * The pose travels in the command, so the bridge needs no copy of home; the
 * backend checks it against the stored home (409 `home_moved` / `home_missing`).
 */

/** Wire shape of `ReturnParams` (shared/schemas/commands.py, 0.0.33). Unlike
 * NAV_GOTO's, `yaw_rad` is required: home has a heading. */
export interface ReturnParams {
  x_m: number
  y_m: number
  yaw_rad: number
  map_id: string
  floor_id: string
  /** The floor's `content_hash`; the bridge refuses a walk planned on another version. */
  map_hash?: string | null
}

export type ReturnHomeProblem = 'noMap' | 'noFloor' | 'noHome'

export type ReturnHomeTarget =
  | { ok: true; map: SiteMap; floor: MapFloor; params: ReturnParams }
  | { ok: false; reason: ReturnHomeProblem }

/** The floor of `map` the robot runs: the one its files hash to, else the
 * only floor there is. Null when that cannot be told. */
function robotFloor(map: SiteMap, navMapHash: string | null | undefined): MapFloor | null {
  const byHash = navMapHash ? map.floors.find((f) => f.content_hash === navMapHash) : undefined
  if (byHash) return byHash
  return map.floors.length === 1 ? map.floors[0] : null
}

/** Where Return home would walk this robot, from the site's maps (all of them,
 * so the robot's own is found whichever one the page shows). */
export function returnHomeTarget(robot: Pick<RobotState, 'bridge'>, maps: readonly SiteMap[]): ReturnHomeTarget {
  const mapId = robot.bridge?.nav_map_id ?? null
  const map = mapId ? maps.find((m) => m.map_id === mapId) : undefined
  if (!map) return { ok: false, reason: 'noMap' }
  const floor = robotFloor(map, robot.bridge?.nav_map_hash)
  if (!floor) return { ok: false, reason: 'noFloor' }
  const home = floor.home
  if (!home) return { ok: false, reason: 'noHome' }
  return {
    ok: true, map, floor,
    params: {
      x_m: home.x_m, y_m: home.y_m, yaw_rad: home.yaw_rad,
      map_id: map.map_id, floor_id: String(floor.index),
      map_hash: floor.content_hash ?? null,
    },
  }
}

/** Whether the run view says a mission run exists, running or paused. */
const runExists = (robot: Pick<RobotState, 'active_run'>, run: RobotRunView | undefined) =>
  run?.phase === 'running' || run?.phase === 'paused' || robot.active_run != null

/**
 * Whether Return home can be pressed now, why not, and what it would send.
 * The order is the one the operator has to work through: a mission first
 * ("Stop the mission first"), then whether there is a home to go to, then
 * whether the robot is placed on the map, then everything RETURN shares with
 * NAV_GOTO (bridge, E-Stop, battery, who holds control, standing).
 */
export function returnHomeAvailability(
  robot: RobotState, run: RobotRunView | undefined | null, maps: readonly SiteMap[],
): CommandAvailability & { params?: ReturnParams } {
  const policy = getCommandAvailability(robot, 'RETURN', run ?? undefined)
  if (runExists(robot, run ?? undefined) && !policy.enabled) return policy
  const target = returnHomeTarget(robot, maps)
  if (!target.ok) return { enabled: false, reason: i18n.t(`liveops.returnHome.${target.reason}`) }
  if (robotPlacementProblem(robot)) return { enabled: false, reason: i18n.t('liveops.returnHome.notPlaced') }
  if (!policy.enabled) return policy
  return { enabled: true, params: target.params }
}

/** The robot is walking home now (or the walk home is stuck and waiting). */
export function isReturningHome(robot: Pick<RobotState, 'nav_goal'>): boolean {
  const goal = readNavGoal(robot.nav_goal)
  return goal?.purpose === 'return' && (goal.state === 'active' || goal.state === 'stuck')
}

/** A walk home that arrived and a robot still there counts as "Home"; this far
 * from the goal, metres, it has been moved since. */
export const STILL_HOME_M = 1.0

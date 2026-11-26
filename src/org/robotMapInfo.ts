import { robotMapMatch } from '@/components/maps/robotMaps'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * Which map a robot carries, as Fleet's Map row and Org › Sites' Robots tab
 * show it: the map its nav stack is set up for (`bridge.nav_map_id`), whether
 * it runs that map's current version, and whether it has been placed on it
 * (`bridge.nav_localised`). The version test is `robotMapMatch`, the one the
 * Map page's Robots rows use (components/maps/robotMaps.ts), asked of every
 * floor: the bridge reports a hash, not which floor it is for.
 */

/** `same`: the robot's files hash to one of the map's floors. `differs`: it
 * reports a hash and none match. `unknown`: no hash on one side or the other. */
export type RobotMapVersion = 'same' | 'differs' | 'unknown'

export type RobotMapInfo =
  /** Set up for no map (no nav, or never given one). */
  | { kind: 'noMap'; placed: null }
  /** Set up for a map this site does not have, or whose list is not in yet. */
  | { kind: 'elsewhere'; mapId: string; placed: boolean | null }
  | { kind: 'onMap'; map: SiteMap; version: RobotMapVersion; placed: boolean | null }

export function robotMapInfo(robot: Pick<RobotState, 'bridge'>, maps: readonly SiteMap[] | null): RobotMapInfo {
  const mapId = robot.bridge?.nav_map_id ?? null
  // Null means "not reported", never true or false.
  const placed = robot.bridge?.nav_localised ?? null
  if (!mapId) return { kind: 'noMap', placed: null }
  const map = maps?.find((m) => m.map_id === mapId)
  if (!map) return { kind: 'elsewhere', mapId, placed }
  const matches = map.floors.map((f) => robotMapMatch(robot, map.map_id, f.content_hash))
  const version: RobotMapVersion = matches.includes('same') ? 'same' : matches.includes('differs') ? 'differs' : 'unknown'
  return { kind: 'onMap', map, version, placed }
}

/** The robots set up for `mapId`. */
export function robotsOnMap<T extends Pick<RobotState, 'bridge'>>(robots: readonly T[], mapId: string): T[] {
  return robots.filter((r) => r.bridge?.nav_map_id === mapId)
}

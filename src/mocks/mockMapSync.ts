import type { RobotState } from '@/types'
import type { SiteMap, SyncMapPart, SyncMapResult } from '@/types/maps'
import { MOCK_VENUE_OLD_HASH } from './maps'

/**
 * The mock bridge's SYNC_MAP (schema 0.0.26), standing in for
 * roverhub-edge robot_bridge's map sync: refused for the same reasons, and on
 * success the robot's nav_map_hash becomes the floor's content_hash when the
 * command completes (about 2.5 s, the mock's ack walk), which the console then
 * sees as it would the next registration.
 */

const HASH = /^[0-9a-f]{64}$/

/** Why the mock bridge refuses a SYNC_MAP, or null. `map` is the map as the
 *  mock backend holds it now. */
export function mockMapSyncRefusal(
  robot: RobotState | undefined, params: Record<string, unknown> | undefined, map: SiteMap | null, runActive: boolean,
): string | null {
  const mapId = params?.map_id
  const floorIndex = params?.floor_index ?? 0
  const hash = params?.map_hash
  if (typeof mapId !== 'string' || !mapId || typeof floorIndex !== 'number' || floorIndex < 0 || typeof hash !== 'string' || !HASH.test(hash)) {
    return 'REJECTED_INVALID_PARAMS: SYNC_MAP needs map_id, floor_index and a 64-hex map_hash'
  }
  if (!robot) return 'REJECTED_NO_CONNECTION: no such robot'
  const navMap = robot.bridge?.nav_map_id ?? null
  if (navMap === null) return 'REJECTED_NAV_DISABLED: nav is not enabled on this robot'
  if (navMap !== mapId) return `REJECTED_NAV_MAP_MISMATCH: this robot is set up for map ${navMap}`
  if (robot.abstract_state === 'E_STOP') return 'REJECTED_ESTOP'
  if (robot.nav_goal?.state === 'active') return 'REJECTED_NAV_GOAL_ACTIVE: the robot is walking to a goal'
  if (runActive || robot.active_run != null || robot.abstract_state === 'AUTO_MISSION') {
    return 'REJECTED_RUN_ACTIVE: a mission run is active'
  }
  const floor = map?.floors.find((f) => f.index === floorIndex)
  if (!floor) return `REJECTED_INVALID_PARAMS: map ${mapId} has no floor ${floorIndex}`
  // The bridge builds the files and hashes them; a floor edited since the
  // console read it hashes to something else, and nothing is replaced.
  if (floor.content_hash !== hash) {
    return `sending the map failed: the files built from the cloud's map hash to ${String(floor.content_hash).slice(0, 12)}, `
      + `not the version the console sent (${hash.slice(0, 12)}); nothing was changed`
  }
  return null
}

/** What a completed mock sync replaced. A robot still on the older survey
 *  (the seeded MOCK_VENUE_OLD_HASH) gets every part, the localisation grid
 *  included, so the "set its position again" path can be seen; any later sync
 *  is a planning edit only. */
export function mockMapSyncResult(previousHash: string | null | undefined, mapHash: string): SyncMapResult {
  const changed: SyncMapPart[] = previousHash === MOCK_VENUE_OLD_HASH || !previousHash
    ? ['localisation', 'planning', 'zones']
    : ['planning']
  return { map_hash: mapHash, changed, relocalise: changed.includes('localisation') }
}

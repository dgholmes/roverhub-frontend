import type { TFunction } from 'i18next'
import i18n from '@/i18n'
import { bridgeLiveness } from '@/fleet/bridgeHealth'
import { isMissionOwner, isNavOwner } from '@/liveops/controlOwner'
import { refusalOf } from '@/lib/refusals'
import { schemaAtLeast } from '@/lib/schemaVersion'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import type { SyncMapParams, UseNavMapParams } from '@/types/maps'

/**
 * "Send to robot" (schema 0.0.26): whether a robot runs the floor the console
 * shows, and sending it there.
 *
 * A robot's bridge reports the map its nav stack is set up for (`nav_map_id`)
 * and the content hash of the files it loaded (`nav_map_hash`) in its
 * registration; a floor's `content_hash` is the same hash of the floor as the
 * backend holds it (shared/schemas/map_hash.py). Equal means the robot plans
 * and localises on exactly what Missions › Maps shows. SYNC_MAP asks the
 * bridge to download the floor, check that the files it builds hash to that
 * value, and swap them in; the next registration carries the new hash.
 */

/** The bridge schema that understands SYNC_MAP. An older one refuses it as an
 *  unknown command type, so it is never offered. */
export const SYNC_MAP_SCHEMA = '0.0.26'

/** `same` (green), `differs` (amber), `unknown` (grey: no hash on either
 *  side), `otherMap` (grey: the robot is set up for another map, and a sync
 *  would be refused). */
export type RobotMapMatch = 'same' | 'differs' | 'unknown' | 'otherMap'

type NavBridge = Pick<RobotState, 'bridge'>

export function robotMapMatch(robot: NavBridge, mapId: string, floorHash: string | null | undefined): RobotMapMatch {
  const navMap = robot.bridge?.nav_map_id ?? null
  if (navMap !== null && navMap !== mapId) return 'otherMap'
  const hash = robot.bridge?.nav_map_hash ?? null
  if (!hash || !floorHash) return 'unknown'
  return hash === floorHash ? 'same' : 'differs'
}

/** The robots "Robot maps" lists for a map: every one set up for it, and
 *  every one that reports a hash at all (one on another map shows as such). */
export function robotsForMap<T extends NavBridge>(robots: T[], mapId: string): T[] {
  return robots.filter((r) => r.bridge?.nav_map_id === mapId || !!r.bridge?.nav_map_hash)
}

/** Why Send to robot is off for this robot now, or null. The bridge refuses
 *  the same and more (nav off, another map); these are the ones the console
 *  can see coming. */
export type SyncBlock = 'offline' | 'oldBridge' | 'estop' | 'mission' | 'walking'

export function syncBlock(
  robot: Pick<RobotState, 'connectivity' | 'bridge' | 'abstract_state' | 'active_run' | 'control_owner' | 'nav_goal'>,
  now = Date.now(),
): SyncBlock | null {
  if (robot.connectivity.bridge_state !== 'connected' || bridgeLiveness(robot.bridge?.last_heartbeat_at, now) === 'silent') {
    return 'offline'
  }
  if (!schemaAtLeast(robot.bridge?.schema_version, SYNC_MAP_SCHEMA)) return 'oldBridge'
  if (robot.abstract_state === 'E_STOP') return 'estop'
  if (robot.active_run != null || isMissionOwner(robot.control_owner) || robot.abstract_state === 'AUTO_MISSION') return 'mission'
  if (robot.nav_goal?.state === 'active' || robot.nav_goal?.state === 'stuck' || isNavOwner(robot.control_owner)) return 'walking'
  return null
}

/** What came back from a SYNC_MAP, for the row that sent it. `detail` is the
 *  bridge's own words after its code (which file, which hash), shown under
 *  the reason when the code's words do not already carry it. */
export type SyncOutcome =
  | { ok: true; relocalise: boolean; mapHash: string | null }
  | { ok: false; reason: string; detail: string | null }

export function syncOutcomeOf(t: TFunction, { result, command }: CommandOutcome): SyncOutcome {
  if (result === 'completed') {
    const r = command.result ?? {}
    return { ok: true, relocalise: r.relocalise === true, mapHash: typeof r.map_hash === 'string' ? r.map_hash : null }
  }
  if (result === 'unknown') return { ok: false, reason: t('missions.maps.robots.lost'), detail: null }
  const raw = command.failure_reason?.trim() ?? ''
  if (!raw) return { ok: false, reason: t('missions.maps.robots.noReason'), detail: null }
  const refusal = refusalOf(t, raw)
  // A failure after the checks reads "sending the map failed: <why>"
  // (command_sender.py); "Not sent:" already says the first half.
  if (!refusal) return { ok: false, reason: raw.replace(/^sending the map failed:\s*/i, ''), detail: null }
  const detail = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : ''
  const reason = refusal.known ? refusal.text : t('command.refusal.unknownWithCode', { code: refusal.code })
  return { ok: false, reason, detail: detail && !reason.includes(detail) ? detail : null }
}

/** Sends SYNC_MAP through the store's dispatch (the command toast and its
 *  acks, the mock's simulated bridge), resolving on the first terminal stage.
 *  The store is imported on send, so this page does not build it by import. */
export async function sendMapToRobot(robotId: string, params: SyncMapParams): Promise<CommandOutcome> {
  const { useLiveOpsStore } = await import('@/store/useLiveOpsStore')
  return useLiveOpsStore.getState().dispatchCommandAsync(
    robotId, 'SYNC_MAP', i18n.t('missions.maps.robots.commandLabel'), { ...params },
  )
}

/** The bridge schema that understands USE_NAV_MAP (and the rest of the map
 *  ready commands). The backend refuses them for an older one. */
export const USE_NAV_MAP_SCHEMA = '0.0.29'

/** Why Use this map is not offered for this robot now, or null: the same
 *  blockers as Send to robot (offline, E-Stop, mission, walking), with the
 *  0.0.29 bridge USE_NAV_MAP needs. The bridge refuses the same and more
 *  (nav not installed, a survey running); these are the ones the console can
 *  see coming. Not named `use...`: it is not a hook. */
export function navMapSwitchBlock(
  robot: Parameters<typeof syncBlock>[0],
  now = Date.now(),
): SyncBlock | null {
  const block = syncBlock(robot, now)
  if (block === 'offline') return block
  if (!schemaAtLeast(robot.bridge?.schema_version, USE_NAV_MAP_SCHEMA)) return 'oldBridge'
  return block
}

/** "Use this map on a robot" (0.0.29): sends USE_NAV_MAP through the store's
 *  dispatch, like Send to robot. Unlike SYNC_MAP it may change which map the
 *  robot is set up for, on a robot that has never had one: the bridge builds
 *  the floor's files, checks the hash, restarts its nav stack, and acks
 *  `relocalise` -- the robot must then be placed (Set position). Its outcome
 *  reads like a sync's (`syncOutcomeOf`). Named `send...` rather than
 *  `useNavMap` because it is not a React hook, and the hooks lint rule would
 *  refuse it in a click handler. */
export async function sendUseNavMap(robotId: string, params: UseNavMapParams): Promise<CommandOutcome> {
  const { useLiveOpsStore } = await import('@/store/useLiveOpsStore')
  return useLiveOpsStore.getState().dispatchCommandAsync(
    robotId, 'USE_NAV_MAP', i18n.t('missions.maps.robots.useCommandLabel'), { ...params },
  )
}

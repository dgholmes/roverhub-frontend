import type { CommandType, RobotState } from '@/types'
import type { KeptRecording, RobotBridgeInfo } from '@/types/robotState'
import { SITE_ID_PATTERN } from '@/types/commands'

/**
 * The mock bridge's side of the map ready commands (schema 0.0.29), standing
 * in for roverhub-edge's survey_controller / recordings / nav_map_choice /
 * site_choice: what it refuses, and what a completed command changes in the
 * robot's next registration. Pure, so it is testable without timers.
 *
 * REPROCESS_SURVEY only acks here: the demo has no recording to rerun.
 * SKIP_MOVING_SEARCH goes ahead while the mock survey (mockSurvey.ts) is
 * finding things that moved, and is refused otherwise. SET_SITE acks `restarting` and leaves the robot
 * where it is, because the demo has one site's robots and no bridge to restart.
 */

export const MAP_READY_COMMAND_TYPES: ReadonlySet<CommandType> = new Set<CommandType>([
  'REPROCESS_SURVEY', 'SET_SURVEY_KEEP', 'DELETE_SURVEY_RECORDING', 'SKIP_MOVING_SEARCH', 'USE_NAV_MAP', 'SET_SITE',
])

const HASH = /^[0-9a-f]{64}$/

type Robot = Pick<RobotState, 'abstract_state' | 'bridge' | 'nav_goal'>

/** Why the mock bridge refuses one of the map ready commands, or null. */
export function mockMapReadyRefusal(robot: Robot | undefined, type: CommandType, params: Record<string, unknown> | undefined,
  runActive: boolean, findingMoved = false): string | null {
  if (!MAP_READY_COMMAND_TYPES.has(type)) return null
  const p = params ?? {}
  if (type === 'USE_NAV_MAP' || type === 'SET_SITE') {
    if (type === 'USE_NAV_MAP' && (typeof p.map_id !== 'string' || !p.map_id || typeof p.map_hash !== 'string' || !HASH.test(p.map_hash))) {
      return 'REJECTED_INVALID_PARAMS: USE_NAV_MAP needs map_id and a 64-hex map_hash'
    }
    if (type === 'SET_SITE' && (typeof p.site_id !== 'string' || !SITE_ID_PATTERN.test(p.site_id))) {
      return 'REJECTED_INVALID_PARAMS: SET_SITE needs a site_id that can be a topic level'
    }
    // Idle only, as the bridge checks it.
    if (robot?.abstract_state === 'E_STOP') return 'REJECTED_ESTOP'
    if (runActive) return 'REJECTED_RUN_ACTIVE: a mission run is active -- stop it first'
    const goal = robot?.nav_goal?.state
    if (goal === 'active' || goal === 'stuck') return 'REJECTED_NAV_GOAL_ACTIVE: the robot is walking to a point -- cancel it first'
    return null
  }
  if (typeof p.survey_id !== 'string' || !p.survey_id) return `REJECTED_INVALID_PARAMS: ${type} needs a survey_id`
  if (type === 'SKIP_MOVING_SEARCH') return findingMoved ? null : 'REJECTED_SURVEY_NOT_PROCESSING: that survey is not finding things that moved now'
  const recording = robot?.bridge?.recordings?.find((r) => r.survey_id === p.survey_id)
  if (!recording) return `REJECTED_SURVEY_UNKNOWN: no survey ${p.survey_id} on this robot`
  if (recording.processing && type !== 'SET_SURVEY_KEEP') return 'REJECTED_SURVEY_ACTIVE: that survey is being processed'
  if (type === 'REPROCESS_SURVEY' && !recording.has_bag) return `REJECTED_SURVEY_NO_RECORDING: ${p.survey_id} has no bag any more`
  return null
}

/** A completed map ready command: what the robot's registration says next
 *  (null for no change) and the ack's `result`. */
export function mockMapReadyDone(bridge: RobotBridgeInfo | undefined, type: CommandType, params: Record<string, unknown> | undefined):
  { bridge: RobotBridgeInfo | null; result: Record<string, unknown> | null } {
  const p = params ?? {}
  const recordings = bridge?.recordings ?? []
  const withRecordings = (next: KeptRecording[]): RobotBridgeInfo | null => (bridge ? { ...bridge, recordings: next } : null)
  switch (type) {
    case 'USE_NAV_MAP':
      return {
        // A new map: the robot is not placed on it until Set position.
        bridge: bridge ? { ...bridge, nav_map_id: String(p.map_id), nav_map_hash: String(p.map_hash), nav_localised: false } : null,
        result: { map_hash: p.map_hash, relocalise: true },
      }
    case 'SET_SURVEY_KEEP':
      return {
        bridge: withRecordings(recordings.map((r) => (r.survey_id === p.survey_id ? { ...r, keep: p.keep === true } : r))),
        result: { survey_id: p.survey_id, keep: p.keep === true },
      }
    case 'DELETE_SURVEY_RECORDING': {
      // The bag, cameras, map.pcd and the rebuild go; the results stay, so the
      // survey is still listed, smaller and with nothing to process again.
      const gone = recordings.find((r) => r.survey_id === p.survey_id)
      const freed = gone ? Math.round(gone.bytes * 0.95) : 0
      const next = withRecordings(recordings.map((r) => (r.survey_id === p.survey_id
        ? { ...r, has_bag: false, has_cameras: false, bytes: r.bytes - freed } : r)))
      const free = next?.disk_free_gb
      return {
        bridge: next && typeof free === 'number' ? { ...next, disk_free_gb: Math.round((free + freed / 1e9) * 10) / 10 } : next,
        result: { survey_id: p.survey_id, bytes_freed: freed },
      }
    }
    case 'SET_SITE':
      return { bridge: null, result: { restarting: true } }
    default:
      return { bridge: null, result: null }
  }
}

import type { MissionLibraryEntry, RunPage, RunQuery } from '@/types'
import { airborneMovesIn } from './quickActions'

/**
 * Whether starting `mission` on `robotId` must ask first, and about which moves.
 *
 * A route mission whose waypoints make a Jump, Backflip or Twirl Jump asks
 * before it first runs on a robot (operator, 2026-11-26): the space around each
 * of those waypoints has to be clear, and nobody has seen this robot do them
 * there yet. "First" means no earlier run of this mission on this robot in
 * `GET /runs`. The runs are read only when Run is pressed, and a list that
 * cannot be read asks: an unread history is not a clean one.
 *
 * Returns the airborne moves' SET_STATE targets, in route order; empty when
 * nothing needs asking. Unattended scheduled runs cannot ask, which is why
 * `UNATTENDED_RUNS_ENABLED` stays off.
 */
export async function firstRunMovesToConfirm(
  mission: Pick<MissionLibraryEntry, 'mission_id' | 'kind' | 'waypoints'>,
  robotId: string,
  listRuns: (query: RunQuery) => Promise<RunPage>,
): Promise<string[]> {
  const moves = airborneMovesIn(mission)
  if (moves.length === 0) return []
  try {
    const page = await listRuns({ mission_id: mission.mission_id, robot_id: robotId, limit: 1 })
    // Filtered again here: a backend that ignored a filter must not make
    // another mission's or robot's run count as this one's.
    const earlier = page.items.some((r) => r.mission_id === mission.mission_id && r.robot_id === robotId)
    return earlier ? [] : moves
  } catch {
    return moves
  }
}

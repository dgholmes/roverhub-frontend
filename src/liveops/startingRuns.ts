import type { RobotState } from '@/types'

/** robot_id -> the run this console started there and has not yet seen on the
 * robot's /state. LiveOps says "Starting the mission…" for it rather than "No
 * active mission": after Run now, the robot spends its warm-up (standing up)
 * before active_run appears. */
export type StartingRuns = Record<string, { runId: string; at: number }>

/** How long a start may go unseen before the hint is dropped: the backend
 * fails an unanswered START_MISSION at 30 s (runs/dispatch.py ACK_TIMEOUT_S). */
export const START_HINT_MAX_MS = 35_000

/** The starts still in flight: drops each one whose run the robot now shows, or
 * that has waited past START_HINT_MAX_MS. Returns `starting` itself when nothing
 * changed, so a store update can be skipped on every telemetry frame. */
export function reconcileStartingRuns(starting: StartingRuns, robots: RobotState[], now: number): StartingRuns {
  let next: StartingRuns | null = null
  for (const [robotId, s] of Object.entries(starting)) {
    const shown = robots.find((r) => r.robot_id === robotId)?.active_run?.run_id === s.runId
    if (shown || now - s.at >= START_HINT_MAX_MS) {
      next ??= { ...starting }
      delete next[robotId]
    }
  }
  return next ?? starting
}

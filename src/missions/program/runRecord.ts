import type { MissionLibraryEntry, MissionRun, RunEvent, RunEventKind } from '@/types'
import type { RunLogEntry, RunOutcome } from './run'

const MAX_RUN_ID = 160

/** Backend run ids allow only `[A-Za-z0-9_.-]`; anything else becomes '-'. */
const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '-')

/** `YYYYMMDD-HHMMSS` in UTC — no colons, which the backend rejects. */
function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

export function makeRunId(missionId: string, robotId: string, now: number): string {
  const robot = safe(robotId)
  const head = `${stamp(now)}-`
  const mission = safe(missionId).slice(0, Math.max(1, MAX_RUN_ID - head.length - robot.length - 1))
  return `${head}${mission}-${robot}`.slice(0, MAX_RUN_ID)
}

const iso = (ms: number) => new Date(ms).toISOString()

/** The record of one program run: the MissionRun row plus its event stream.
 * `event` returns null for entries that carry no event (a step merely starting). */
export function startRunRecord(
  mission: MissionLibraryEntry,
  robot: { robot_id: string; site_id: string },
  operator: string,
  now: number,
) {
  const run_id = makeRunId(mission.mission_id, robot.robot_id, now)
  const run: MissionRun = {
    run_id, mission_id: mission.mission_id, mission, robot_id: robot.robot_id, site_id: robot.site_id,
    started_at: iso(now), ended_at: null, result: 'running', started_by: operator,
    end_reason: null, bucket_copied_at: null,
  }
  const make = (seq: number, at: number, kind: RunEventKind, message: string | null): RunEvent => ({
    run_id, seq, at: iso(at), kind, waypoint_id: null, task_index: null, actor: operator,
    media: null, position: null, detection: null, message,
  })
  return {
    run,
    startedEvent: (): RunEvent => make(0, now, 'run_started', null),
    event(entry: RunLogEntry, seq: number): RunEvent | null {
      if (entry.result === 'started') return null
      if (entry.result === 'done') return make(seq, entry.at, 'task_done', entry.label)
      if (entry.result === 'skipped') return make(seq, entry.at, 'task_skipped', entry.label)
      return make(seq, entry.at, 'alert', entry.detail ? `${entry.label}: ${entry.detail}` : entry.label)
    },
    endedEvent: (outcome: RunOutcome, seq: number, at: number): RunEvent =>
      make(seq, at, 'run_ended', outcome.reason ?? null),
    finish: (outcome: RunOutcome, at: number): MissionRun => ({
      ...run, ended_at: iso(at), result: outcome.result, end_reason: outcome.reason ?? null,
    }),
  }
}

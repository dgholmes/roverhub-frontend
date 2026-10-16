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
 * The record numbers its own events: run_started is seq 0 and every event
 * made after it takes the next seq. `event` returns null for entries that
 * carry no event (a step merely starting), and those use no seq. */
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
  let seq = 1
  return {
    run,
    startedEvent: (): RunEvent => make(0, now, 'run_started', null),
    event(entry: RunLogEntry): RunEvent | null {
      if (entry.result === 'started') return null
      if (entry.result === 'done') {
        // A photo lives in the snapshot library; the event names it so the run can find it.
        return make(seq++, entry.at, 'task_done', entry.snapshotId ? `${entry.label} · ${entry.snapshotId}` : entry.label)
      }
      if (entry.result === 'skipped') return make(seq++, entry.at, 'task_skipped', entry.label)
      return make(seq++, entry.at, 'alert', entry.detail ? `${entry.label}: ${entry.detail}` : entry.label)
    },
    endedEvent: (outcome: RunOutcome, at: number): RunEvent =>
      make(seq++, at, 'run_ended', outcome.reason ?? null),
    finish: (outcome: RunOutcome, at: number): MissionRun => ({
      ...run, ended_at: iso(at), result: outcome.result, end_reason: outcome.reason ?? null,
    }),
  }
}

export type RunRecord = ReturnType<typeof startRunRecord>

export interface RunRecordIO {
  putRun(run: MissionRun): Promise<void>
  postRunEvents(runId: string, events: RunEvent[]): Promise<void>
}

/** Events are sent in batches: whatever has gathered after this long, or as
 * soon as this many have. */
export const RECORD_FLUSH_MS = 1000
export const RECORD_BATCH_MAX = 20

/**
 * Sends a run's record as it happens, one request at a time and in order, so
 * events never overtake the run row they belong to. Events are batched (every
 * RECORD_FLUSH_MS, or RECORD_BATCH_MAX at once, and at the end), so a fast
 * program does not make one request per step. Nothing here is awaited by the
 * runner: a slow or failing record never delays the next robot command. A
 * failure is reported once through `onError` and sending carries on (the
 * backend takes events idempotently by seq).
 */
export function recordSink(rec: RunRecord, io: RunRecordIO, onError: (e: unknown) => void) {
  const id = rec.run.run_id
  let failed = false
  const fail = (e: unknown) => {
    if (failed) return
    failed = true
    onError(e)
  }
  let chain: Promise<void> = Promise.resolve()
  const then = (f: () => Promise<void>) => {
    chain = chain.then(f).catch(fail)
  }
  let pending: RunEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending.length === 0) return
    const batch = pending
    pending = []
    then(() => io.postRunEvents(id, batch))
  }
  then(() => io.putRun(rec.run))
  then(() => io.postRunEvents(id, [rec.startedEvent()]))
  return {
    event(entry: RunLogEntry): void {
      const ev = rec.event(entry)
      if (!ev) return
      pending.push(ev)
      if (pending.length >= RECORD_BATCH_MAX) flush()
      else if (!timer) timer = setTimeout(flush, RECORD_FLUSH_MS)
    },
    /** Closes the record; resolves once everything queued has been tried. */
    end(outcome: RunOutcome, at: number): Promise<void> {
      flush()
      const ev = rec.endedEvent(outcome, at)
      then(() => io.putRun(rec.finish(outcome, at)))
      then(() => io.postRunEvents(id, [ev]))
      return chain
    },
    failed: () => failed,
  }
}

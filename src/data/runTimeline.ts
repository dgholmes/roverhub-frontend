import type { MissionRun, RunEvent, RunEventKind } from '@/types'

/** The run video starts when the run does, so an event's offset into the run
 * is its position in the video. */
export function runDurationMs(run: Pick<MissionRun, 'started_at' | 'ended_at'>, now = Date.now()): number {
  const end = run.ended_at ? Date.parse(run.ended_at) : now
  return Math.max(0, end - Date.parse(run.started_at))
}

export function eventOffsetMs(run: Pick<MissionRun, 'started_at'>, event: Pick<RunEvent, 'at'>): number {
  return Date.parse(event.at) - Date.parse(run.started_at)
}

export function timelineMarks(run: MissionRun, events: RunEvent[]): { seq: number; pct: number; kind: RunEventKind }[] {
  const total = runDurationMs(run) || 1
  return events.map((e) => ({ seq: e.seq, kind: e.kind, pct: Math.min(100, Math.max(0, (eventOffsetMs(run, e) / total) * 100)) }))
}

/** Events arrive in seq order, which is chronological, so the last one that
 * is not after the position is the latest. */
export function eventsAtOrBefore(events: RunEvent[], offsetMs: number, run: MissionRun): RunEvent | null {
  let best: RunEvent | null = null
  for (const e of events) if (eventOffsetMs(run, e) <= offsetMs) best = e
  return best
}

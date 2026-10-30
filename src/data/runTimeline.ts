import type { TFunction } from 'i18next'
import { color } from '@/design-system/tokens'
import { runReasonText } from '@/components/missions/program/runText'
import type { MissionRun, RunEvent, RunEventKind, RunFile } from '@/types'

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

const MARK: Partial<Record<RunEventKind, string>> = {
  detection: color.amber, task_done: color.accent, announcement_played: color.green,
  alert: color.red, recording_gap: color.red, task_skipped: color.amber,
  step_done: color.accent, step_failed: color.red, step_skipped: color.amber, paused: color.amber,
}

export function markColor(kind: RunEventKind): string {
  return MARK[kind] ?? color.t3
}

/** After the user clicks an event, playback updates must not overwrite the
 * selection for a second, or the seek's own timeupdate would undo the click. */
export const CLICK_HOLD_MS = 1000
export function followsPlayback(now: number, clickedAt: number): boolean {
  return now - clickedAt > CLICK_HOLD_MS
}

/** 24-hour HH:MM:SS in the given locale; h23 so midnight is 00, not 24. */
export function formatClock(iso: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
}

/** The run's recordings other than the one in the player: every other video
 * (task clips, a second camera's run video), then every audio file. */
export function otherRecordings(files: RunFile[], playing: string | null): RunFile[] {
  return [
    ...files.filter((f) => f.path.startsWith('video/') && f.path !== playing),
    ...files.filter((f) => f.path.startsWith('audio/')),
  ]
}

/** File size in binary units, whole numbers below a gigabyte. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export interface RunEventView {
  title: string
  /** The step label, waypoint or note, with the reason or result after it. */
  detail: string | null
  /** A snapshot taken by the step, or a still attached to the event. */
  thumbUrl: string | null
}

/** What one event row says. Edge runs put the step's label in `message` and
 * the why in `reason`; older browser-run records carry a waypoint or a note. */
export function describeRunEvent(
  e: RunEvent,
  o: { t: TFunction; waypointLabel: (id: string) => string | undefined; snapshotUrl: (id: string) => string },
): RunEventView {
  const { t } = o
  const label = e.message ?? (e.waypoint_id ? o.waypointLabel(e.waypoint_id) : undefined) ?? null
  const why = e.kind === 'run_ended'
    ? [e.result ? t(`data.runs.result.${e.result}`) : null, e.reason ? runReasonText(t, e.reason) : null]
    : [label, e.reason ? runReasonText(t, e.reason) : null]
  return {
    title: t(`data.run.kind.${e.kind}`),
    detail: why.filter(Boolean).join(' · ') || null,
    thumbUrl: e.snapshot_id ? o.snapshotUrl(e.snapshot_id) : null,
  }
}

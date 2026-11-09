import type { MissionLibraryEntry } from './missions'
import type { RobotPosition } from './robotState'
import type { Detection } from './perception'

/** Mirrors shared/schemas/runs.py. Hand-maintained — change both together. */
export const RUN_RESULTS = ['running', 'completed', 'aborted', 'failed'] as const
export type RunResult = (typeof RUN_RESULTS)[number]
export const RUN_EVENT_KINDS = [
  'run_started', 'arrived', 'task_done', 'task_skipped',
  'announcement_played', 'announcement_queued', 'announcement_cancelled',
  'operator_approval', 'alert', 'detection', 'recording_gap', 'run_ended',
  // Edge-executed programs: a step per transition, plus pause/resume on control hand-over.
  'step_started', 'step_done', 'step_failed', 'step_skipped', 'paused', 'resumed',
] as const
export type RunEventKind = (typeof RUN_EVENT_KINDS)[number]
/** Where a run was started from. Null on records older than 0.0.11. */
export type RunSource = 'editor' | 'run_now' | 'schedule'


export interface MissionRun {
  run_id: string
  mission_id: string
  mission: MissionLibraryEntry
  robot_id: string
  site_id: string
  started_at: string
  ended_at: string | null
  result: RunResult
  started_by: string
  end_reason: string | null
  bucket_copied_at: string | null
  source: RunSource | null
  /** The bridge process that ran it; a different boot id on /state means it died with the old one. */
  bridge_boot_id: string | null
}

export interface RunEvent {
  run_id: string
  seq: number
  at: string
  kind: RunEventKind
  waypoint_id: string | null
  task_index: number | null
  actor: string | null
  media: string | null
  position: RobotPosition | null
  detection: Detection | null
  message: string | null
  /** Step events name the block; run_ended carries the outcome and why. */
  block_id: string | null
  result: RunResult | null
  /** A camelCase RunReason key (or free text on older records). */
  reason: string | null
  /** A SNAPSHOT step's picture. */
  snapshot_id: string | null
}

export interface RunSummary extends MissionRun {
  photo_count: number
  video_count: number
  detection_count: number
}
export interface RunFile { path: string; size_bytes: number }
export interface RunDetail { run: MissionRun; files: RunFile[]; event_count: number }
export interface RunQuery { site_id?: string; robot_id?: string; mission_id?: string; since?: string; limit?: number; offset?: number }
export interface RunPage { items: RunSummary[]; total: number; next_offset: number | null; sample: boolean }

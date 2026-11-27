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

/**
 * GET /runs/{id}/track: the mission run log for the run page
 * (docs/superpowers/specs/2026-11-27-mission-run-log-design.md §4, the plan's
 * Task 2 shape). Column names are shared/schemas/run_trace.py TRACE_COLUMNS;
 * a null cell is "not known at that moment", never zero. `history` is the
 * backend's 5 s telemetry samples for a run older than run logs (t, x, y, yaw,
 * state, control_owner, meas_vx only); `none` has no samples at all.
 */
export type RunTrackSource = 'trace' | 'history' | 'none'
export const TRACE_COLUMNS = [
  't', 'at', 'x', 'y', 'yaw', 'cov_xy',
  'ask_vx', 'ask_vy', 'ask_wz', 'sent_vx', 'sent_vy', 'sent_wz', 'meas_vx', 'meas_vy', 'meas_wz',
  'controller', 'goal_id', 'goal_state', 'state', 'control_owner', 'estop', 'fwd_dropped',
] as const
export type TraceColumn = (typeof TRACE_COLUMNS)[number]
export type TraceCell = number | string | null

/** shared/schemas/run_trace.py TracePlan. */
export interface TracePlan {
  t: number
  goal_id: string | null
  failed: boolean
  points: [number, number][]
}

/** shared/schemas/run_trace.py TraceLeg: one nav goal's walk score. */
export interface TraceLeg {
  t_start: number
  t_end: number
  goal_id: string | null
  waypoint_id: string | null
  outcome: string | null
  duration_s: number
  walked_m: number
  first_plan_m: number | null
  straight_m: number | null
  heading_change_deg_per_m: number | null
  turn_in_place_s: number
  tight_s: number | null
  plans: number
  route_changes: number
  line: string
}

export type RunTrackMarkerKind = 'stuck' | 'estop' | 'estop_released' | 'take_over' | 'control_back' | 'controller'
export interface RunTrackMarker { t: number; kind: RunTrackMarkerKind; label: string }
export interface RunTrackLogLine { t: number | null; level: string; logger: string; message: string }

export interface RunTrack {
  source: RunTrackSource
  trace_version: number | null
  started_at: string
  duration_s: number
  /** Column name -> one cell per sample; a history track carries only some. */
  columns: Partial<Record<TraceColumn, TraceCell[]>>
  plans: TracePlan[]
  legs: TraceLeg[]
  log: RunTrackLogLine[]
  markers: RunTrackMarker[]
  /** camera -> the run video's path in the run store and where it starts: video time = t - offset_s. */
  video: Record<string, { path: string; offset_s: number }>
  map: { map_id: string; floor_index: number } | null
}

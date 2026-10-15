import type { MissionLibraryEntry } from './missions'
import type { RobotPosition } from './robotState'

/** Mirrors shared/schemas/runs.py. Hand-maintained — change both together. */
export type RunResult = 'running' | 'completed' | 'aborted' | 'failed'
export type RunEventKind =
  | 'run_started' | 'arrived' | 'task_done' | 'task_skipped'
  | 'announcement_played' | 'announcement_queued' | 'announcement_cancelled'
  | 'operator_approval' | 'alert' | 'detection' | 'recording_gap' | 'run_ended'

export interface Detection {
  label: string
  confidence: number
  bbox: [number, number, number, number]
  camera: string
  model: string
}

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

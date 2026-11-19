/**
 * Mirrors shared/schemas/survey_replay.py (schema 0.0.28). Hand-maintained --
 * change both together; `src/missions/missionTasks.test.ts` reads that file and
 * fails on drift (skipped, with a warning, while the shared/ clone it reads
 * predates survey_replay.py).
 *
 * What the backend keeps about a survey after it ends, for Data › Surveys: the
 * survey's record and its takes (FAST-LIO2 trajectories: the live "original",
 * re-runs, and hand-run imports), each judged against the robot's own leg
 * odometry in SEGMENT_S slices. No MQTT: these are files in the backend's
 * survey store, read over REST:
 *   - GET /surveys?site_id=&robot_id=          -> { items: SurveySummary[] }
 *   - GET /surveys/{id}                        -> SurveyDetail
 *   - GET /surveys/{id}/takes/{take}/files/paths.json    -> TakePaths
 *   - GET /surveys/{id}/takes/{take}/files/segments.json -> TakeSegment[]
 *     (404 when that file was never uploaded)
 *
 * Time: `t`, and every *_s field measured within a take (start_s, end_s,
 * first_bad_s), is seconds on the Jetson clock since the take's first pose.
 * `window_start_s` is seconds from the start of the original recording.
 */
import type { CameraSet } from './survey'

/** Mirrors `SEGMENT_S`: the length of one judged slice of a take, seconds. */
export const SEGMENT_S = 20.0

export const SEGMENT_VERDICTS = ['good', 'watch', 'bad', 'standing', 'no_data'] as const
export type SegmentVerdict = typeof SEGMENT_VERDICTS[number]

export const TAKE_SOURCES = ['live', 'replay', 'manual'] as const
export type TakeSource = typeof TAKE_SOURCES[number]

export const TAKE_STATUSES = ['queued', 'running', 'building', 'uploading', 'done', 'failed', 'cancelled'] as const
export type TakeStatus = typeof TAKE_STATUSES[number]

/** How the legs were fitted to the take: not at all (no legs, or too little to
 * fit), to the original take, or the legs are the reference frame. */
export const TAKE_FITS = ['none', 'original', 'legs'] as const
export type TakeFit = typeof TAKE_FITS[number]

/** t, x, y, z, yaw: seconds (see Time above), metres in the levelled take frame, radians. */
export type PathSample = [t: number, x: number, y: number, z: number, yaw: number]

/** One survey as the backend knows it. */
export interface SurveyRecord {
  survey_id: string
  name: string
  site_id: string
  robot_id: string
  started_at: string
  stopped_at: string | null
  duration_s: number
  floor_index: number
  map_id: string | null
  cameras: CameraSet
  /** False once the device's retention has deleted the bag: nothing can be re-run. */
  recording_kept: boolean
}

/** One SEGMENT_S slice of a take, judged against the legs. */
export interface TakeSegment {
  start_s: number
  end_s: number
  legs_m: number
  take_m: number
  /** take_m / legs_m; null when the segment is standing or has no legs. */
  ratio: number | null
  /** The take's change in yaw minus the legs', degrees. */
  heading_diff_deg: number | null
  z_range_m: number
  max_step_m: number
  /** Receive time minus header stamp, per pose: median and 95th percentile. */
  late_p50_s: number | null
  late_p95_s: number | null
  verdict: SegmentVerdict
  /** p95 lateness above 0.2 s: FAST-LIO2 was falling behind here. */
  late: boolean
}

/** One FAST-LIO2 trajectory for a survey. Every take is compared with the same
 * legs, from the original bag. */
export interface ReplayTake {
  /** "original", "rerun-<UTC stamp>" or "manual-<name>". */
  take_id: string
  survey_id: string
  source: TakeSource
  /** 1-80 characters. */
  label: string
  preset: string | null
  /** The slice of the original recording this take covered, seconds from its start. */
  window_start_s: number
  /** Null means to the end. */
  window_duration_s: number | null
  /** Playback rate of a replay (0.1-2.0); null for the live take. */
  rate: number | null
  status: TakeStatus
  /** 0-1. */
  progress: number | null
  error: string | null
  poses: number
  scans_in_window: number | null
  /** Whether FAST-LIO2 kept up with the scans; null when it cannot be told. */
  kept_up: boolean | null
  /** The first bad segment's start; null means no drift found (or no legs). */
  first_bad_s: number | null
  late_segments: number
  take_m: number
  legs_m: number
  has_legs: boolean
  fit: TakeFit
  fit_residual_m: number | null
  created_at: string
  /** What went wrong without failing the take. */
  warnings: string[]
}

/** The take's path and the fitted legs. `legs` is empty when the bag had none. */
export interface TakePaths {
  take_id: string
  take: PathSample[]
  legs: PathSample[]
}

/** A survey in the list. */
export interface SurveySummary extends SurveyRecord {
  take_count: number
  /** The ORIGINAL take's first bad segment start; null means no drift found. */
  first_bad_s: number | null
  has_legs: boolean
  /** The ORIGINAL take's legs_m; null when there is no original take. */
  legs_m: number | null
}

export interface SurveyDetail {
  record: SurveyRecord
  takes: ReplayTake[]
}

/** The list query: both filters optional, an empty string means no filter. */
export interface SurveyQuery {
  site_id?: string
  robot_id?: string
}

/**
 * The survey pipeline's wire shapes (roverhub-backend maps/router.py, jobs.py,
 * quality.py, store.py `list_versions`). These are the backend's own JSON, not
 * shared/schemas models, so nothing checks them against Python: change both
 * together. Tracker 1-5-02 (survey upload), 1-5-05 (quality report),
 * 1-5-06 (versions).
 */

export const MAP_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const
export type MapJobStatus = typeof MAP_JOB_STATUSES[number]
export type MapJobKind = 'survey' | 'quality'

/** A background job on the backend (GET /map-jobs/{id}). `stage` is a short
 *  English phrase the job writes as it goes ("levelling", "building the grid"
 *  ...); `error` is a sentence written for the uploader. */
export interface MapJob {
  job_id: string
  kind: MapJobKind
  map_id: string
  site_id: string | null
  status: MapJobStatus
  stage: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  error: string | null
  result: Record<string, unknown> | null
  requested_by?: string | null
  detail?: Record<string, unknown>
}

export const isJobActive = (job: Pick<MapJob, 'status'>): boolean =>
  job.status === 'queued' || job.status === 'running'

/** How a check's value is judged: `max` passes at or under the threshold,
 *  `min` at or over it, `present` when the thing exists, `info` never fails. */
export type QualityComparison = 'max' | 'min' | 'present' | 'info'
/** `fail` stops a freeze (a blocking check); `warn` is a non-blocking one that
 *  missed; `skipped` had nothing to measure and is never a pass. */
export type QualityCheckStatus = 'pass' | 'fail' | 'warn' | 'info' | 'skipped'

export interface QualityCheck {
  id: string
  /** The floor it measured; null for a map-wide check. */
  floor: number | null
  value: number | boolean | null
  comparison: QualityComparison
  threshold: number | null
  blocking: boolean
  status: QualityCheckStatus
  /** The backend's English explanation. */
  detail: string
}

/** GET /maps/{id}/quality: the stored report plus `current`, whether it was
 *  computed from exactly the files the map holds now. */
export interface MapQualityReport {
  report_version: number
  map_id: string
  /** The bundle version it was computed from. */
  version: number
  computed_at: string
  passed: boolean
  /** Ids of the blocking checks that failed. */
  failed: string[]
  warnings: string[]
  checks: QualityCheck[]
  current: boolean
  thresholds?: Record<string, { comparison: QualityComparison; threshold: number | null; blocking: boolean }>
  floors?: unknown[]
  inputs?: Record<string, string>
}

/** One entry of GET /maps/{id}/versions: the live bundle first, then the kept
 *  ones, newest first. `source` is how the bundle arrived. */
export interface MapVersion {
  version: number
  current: boolean
  source: 'upload' | 'survey' | 'restore' | string
  created_at: string
  restored_from: number | null
  detail: Record<string, unknown>
  name: string
  updated_at: string
  zones: number
  floors: {
    index: number
    size_cells: [number, number]
    resolution_m: number
    origin_xy_m: [number, number]
    free_cells: number
    occupied_cells: number
    unknown_cells: number
    has_planning: boolean
    has_track: boolean
  }[]
  quality: { passed: boolean | null; computed_at: string | null; failed: string[] } | null
}

/** What the console sends to POST /map-surveys. */
export interface SurveyUpload {
  siteId: string
  name: string
  /** The map it makes or replaces. Replacing keeps its zones and other floors,
   *  and puts it back to draft. */
  mapId: string
  floor: number
  /** The FAST-LIO2 point cloud (.pcd), raw or levelled. */
  cloud: Blob
  cloudName: string
  /** The path walked, a CSV whose first line is t,x,y,z. */
  track: Blob
  trackName: string
}

export interface SurveyUploadOptions {
  /** 0..1 as the bytes leave the browser. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Freezing despite a failed report (supervisor only; `reason` is audited). */
export interface FreezeOverride {
  reason: string
}

/** The backend's largest survey upload (maps/router.py MAX_SURVEY_BYTES). */
export const MAX_SURVEY_BYTES = 1024 * 1024 * 1024

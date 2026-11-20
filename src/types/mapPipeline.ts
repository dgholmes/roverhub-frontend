/**
 * The survey pipeline's wire shapes (roverhub-backend maps/router.py, jobs.py,
 * quality.py, store.py `list_versions`). These are the backend's own JSON, not
 * shared/schemas models, so nothing checks them against Python: change both
 * together. Tracker 1-5-02 (survey upload), 1-5-05 (quality report),
 * 1-5-06 (versions).
 */

export const MAP_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const
export type MapJobStatus = typeof MAP_JOB_STATUSES[number]
export type MapJobKind = 'survey' | 'quality' | 'cloud_edits'

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

/** The options of `setMapStatus` (PUT /maps/{id}/status). A `reason` is a
 *  FreezeOverride: freeze despite a failed report. `zonesReviewed` (0.0.29)
 *  answers Activate's zones question -- the user looked and none are needed --
 *  and the backend records who and when on the map (`zones_reviewed_at/by`);
 *  without it, activating a map with no zones is refused 409 `zones_unreviewed`. */
export interface MapStatusOptions extends Partial<FreezeOverride> {
  zonesReviewed?: boolean
}

/** The backend's largest survey upload (maps/router.py MAX_SURVEY_BYTES). */
export const MAX_SURVEY_BYTES = 1024 * 1024 * 1024

// --- The map editor (Missions › Maps › Edit map) -----------------------------
// Contract: scratchpad map-editor/contract.md (2026-11-16). The moved layer is
// written by tools/map_prep/transient_filter.py; the routes by the backend's
// maps/router.py. Change both together.

/** A floor file the editor reads (GET /maps/{id}/floors/{index}/{kind}):
 *  the survey grid and planning grid (P5 PGM), the cloud (float32 x,y,z) and
 *  the points the moving-object check took out (`moved_cloud`, a .pcd), and
 *  the walked path (`track`, a `t,x,y,z` CSV in the floor's frame), which the
 *  "Get it ready" checklist sizes the floor against. */
export type MapFloorFileKind = 'grid' | 'planning' | 'cloud' | 'moved_cloud' | 'track'

/** One spot the moving-object check thinks was not really there (a person
 *  walking past during the survey). Map frame, metres. */
export interface MovedBlob {
  id: string
  centroid: [number, number]
  /** [xmin, ymin, xmax, ymax]. */
  bbox: [number, number, number, number]
  /** [zmin, zmax], map z (not height above the floor). */
  z_range: [number, number]
  area_m2: number
  points: number
  /** Scans that saw something there. */
  hits: number
  /** Scans that saw straight through it: why it is thought to have moved. */
  pass_through: number
  /** The outline, when the tool wrote one. */
  polygon?: [number, number][]
}

/** A floor's `moved.json`. Blobs are sorted by area, biggest first. */
export interface MovedLayer {
  version: number
  source: string
  params: Record<string, unknown>
  blobs: MovedBlob[]
}

/** An axis-aligned box in the map frame (map z, not height above the floor). */
export interface CloudEditBox {
  min: [number, number, number]
  max: [number, number, number]
}

/** POST /maps/{id}/floors/{index}/cloud-edits. */
export interface CloudEdits {
  delete_boxes: CloudEditBox[]
  /** Moved blobs to take out of the cloud (their bbox x z_range) and the file. */
  resolve_moved: string[]
  /** Moved blobs judged real: off the list, nothing else changed. */
  keep_moved?: string[]
  reason?: string
}

/**
 * Perception wire types: shared/schemas/detection.py (schema 0.0.14).
 * Checked field-for-field against the Python by perception.test.ts.
 *
 * Published by the edge perception service (roverhub-edge/perception):
 *   roverhub/{site}/{robot}/incidents          -- Incident
 *   roverhub/{site}/{robot}/perception/status  -- PerceptionStatus (retained)
 */

/** One detected object in one frame. bbox and keypoints are normalised to the frame. */
export interface Detection {
  label: string
  confidence: number
  /** x, y, w, h -- top-left corner and size, 0..1 of the frame. */
  bbox: [number, number, number, number]
  camera: string
  model: string
  detector_id?: string | null
  track_id?: string | null
  /** COCO-17 order; each is [x, y, confidence], x/y normalised to the frame. */
  keypoints?: [number, number, number][] | null
  frame_ts?: string | null
}

export const DETECTOR_STATUSES = ['running', 'degraded', 'unavailable'] as const
export type DetectorStatus = (typeof DETECTOR_STATUSES)[number]

export interface DetectorInfo {
  detector_id: string
  kind: 'model' | 'derived' | 'endpoint'
  version: string
  labels: string[]
  status: DetectorStatus
  fps?: number | null
  reason?: string | null
}

export const SOURCE_STATES = ['live', 'unavailable'] as const
export type SourceState = (typeof SOURCE_STATES)[number]

export interface PerceptionStatus {
  robot_id: string
  site_id: string
  at: string
  camera: string
  source_state: SourceState
  fps?: number | null
  detectors: DetectorInfo[]
}

export const INCIDENT_STATES = ['open', 'acknowledged', 'resolved'] as const
export type IncidentState = (typeof INCIDENT_STATES)[number]

export const INCIDENT_SEVERITIES = ['info', 'warning', 'critical'] as const
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]

export interface Incident {
  incident_id: string
  robot_id: string
  site_id: string
  rule_id: string
  label: string
  severity: IncidentSeverity
  opened_at: string
  camera: string
  detections: Detection[]
  evidence_snapshot_ids: string[]
  evidence_pending: boolean
  state: IncidentState
  message: string
}

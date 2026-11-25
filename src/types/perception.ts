/**
 * Perception wire types: shared/schemas/detection.py (schema 0.0.14; the
 * detection switch, SET_DETECTION, 0.0.31).
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

export const DETECTOR_KINDS = ['model', 'derived', 'endpoint'] as const
export type DetectorKind = (typeof DETECTOR_KINDS)[number]

export interface DetectorInfo {
  detector_id: string
  kind: DetectorKind
  version: string
  labels: string[]
  status: DetectorStatus
  fps?: number | null
  reason?: string | null
}

export const SOURCE_STATES = ['live', 'unavailable'] as const
export type SourceState = (typeof SOURCE_STATES)[number]

/** The detectors an operator can switch (0.0.31), in the order a status lists them. */
export const DETECTOR_IDS = ['base.person', 'base.pose', 'base.fall'] as const
export type DetectorId = (typeof DETECTOR_IDS)[number]

/** What each detector brings with it: a fall is read from a pose, a pose is
 * fitted to a person, so choosing base.fall runs all three. */
export const DETECTOR_NEEDS: Readonly<Partial<Record<DetectorId, DetectorId>>> = {
  'base.fall': 'base.pose',
  'base.pose': 'base.person',
}

/** Why no detector runs (0.0.31): the operator switched detection off, or a
 * survey holds it off until the survey is processed. */
export const DETECTION_OFF_REASONS = ['switched_off', 'survey'] as const
export type DetectionOffReason = (typeof DETECTION_OFF_REASONS)[number]

/** SET_DETECTION's params (0.0.31): the operator's whole detection setting,
 * which replaces the one the robot has. `detectors` absent means all of them;
 * a list must be non-empty with each id at most once ("on, with nothing" is
 * sent as `enabled: false`). liveops/detection.ts builds these. */
export interface SetDetectionParams {
  enabled: boolean
  detectors?: DetectorId[] | null
}

export interface PerceptionStatus {
  robot_id: string
  site_id: string
  at: string
  camera: string
  source_state: SourceState
  fps?: number | null
  detectors: DetectorInfo[]
  /** The operator's setting as perception read it (0.0.31), also while a
   * survey holds detection off. Absent or null from an older perception: not
   * reported, never "off". */
  enabled?: boolean | null
  /** The chosen detectors with what they need, in DETECTOR_IDS order. Plain
   * strings on the wire: a newer perception may list ids this console lacks. */
  selected?: string[] | null
  /** Why nothing runs; null while detection runs (or from an older perception). */
  off_reason?: DetectionOffReason | null
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

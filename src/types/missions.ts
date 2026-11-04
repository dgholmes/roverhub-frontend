/**
 * Mirrors shared/schemas/missions.py. Hand-maintained — change both together.
 * Waypoint coordinates are in the **map** frame, not the robot's odom frame.
 *
 * Scheduling — robot, schedule, dispatch rule — is not here: it moved to
 * `MissionTask` (./tasks.ts), as it did in the Python.
 */

import type { ProgramSteps } from '@/missions/program/types'
import type { GaitMode } from './robotState'

export type MissionType = 'patrol' | 'inspection' | 'escort' | 'return_to_dock' | 'emergency'
export type MissionStatus = 'active' | 'paused' | 'completed' | 'aborted'
export type WaypointStatus = 'pending' | 'active' | 'done' | 'skipped'

// PRD MIS-007 MVP set. `thermal_scan` is R2 and is deliberately absent from
// the wire type — see ActionMenuEntry in WaypointInspector.tsx for how the
// action menu still lists it, disabled, without the wire union admitting it.
export type WaypointActionType =
  | 'snapshot' | 'voice_prompt' | 'led_signal'
  | 'wait' | 'operator_approval' | 'return_to_dock' | 'video_clip'

export interface WaypointAction {
  type: WaypointActionType
  label: string
  params: Record<string, unknown>
}

export interface MissionWaypoint {
  waypoint_id: string
  label: string
  x_m: number
  y_m: number
  z_m: number | null
  /** null means "any heading on arrival" — distinct from 0, which means north. */
  heading_deg: number | null
  tolerance_m: number
  actions: WaypointAction[]
  status: WaypointStatus
}

export type WheelLegMode = 'parallel' | 'x'

export interface Segment {
  from_waypoint_id: string
  to_waypoint_id: string
  speed_mps: number | null
  gait: GaitMode | null
  posture: string | null
  wheel_leg_mode: WheelLegMode | null
}

export interface Mission {
  mission_id: string
  name: string
  type: MissionType
  status: MissionStatus
  robot_id: string
  map_id: string
  waypoints: MissionWaypoint[]
  segments: Segment[]
  current_waypoint_index: number
  dock_coord: { x_m: number; y_m: number; heading_deg: number }
  started_at: string
  eta_min: number | null
}

export function missionProgress(mission: Mission): { current: number; total: number; pct: number } {
  const total = mission.waypoints.length
  const current = Math.min(mission.current_waypoint_index + 1, total)
  const pct = total === 0 ? 0 : Math.round((current / total) * 100)
  return { current, total, pct }
}

/**
 * Missions workspace (docs/05-ui-ux.md §11) — planning-time records, distinct
 * from the live/in-progress `Mission` LiveOps tracks. It is authoring only: it
 * has no robot, no schedule and no lifecycle status, because "scheduled",
 * "completed" and "failed" describe a task or a run, not a mission.
 */

/** A route is a list of waypoints; a program is a serialized Blockly workspace
 * (`program_state`). Exactly one of the two sources of truth is populated. */
export const MISSION_KINDS = ['route', 'program'] as const
export type MissionKind = typeof MISSION_KINDS[number]

export type AreaType = 'indoor' | 'outdoor'
export type SurfaceType = 'hard' | 'carpet' | 'gravel' | 'grass' | 'unknown'
export type HumanProximityPolicy = 'none' | 'slow' | 'pause' | 'alert' | 'require_takeover'
export type ValidationSeverity = 'info' | 'warning' | 'error'
export type ValidationStatus = 'valid' | 'warnings' | 'invalid' | 'unvalidated'

/** PRD §10.3. Every default is the cautious option. */
export interface GroundConstraints {
  stairs_allowed: boolean
  max_slope_deg: number | null
  min_clearance_m: number | null
  area_type: AreaType
  no_go_zone_ids: string[]
  surface_type: SurfaceType
  human_proximity_policy: HumanProximityPolicy
}

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  message: string
  waypoint_id: string | null
  /** Set by program checks: the block the issue is about. */
  blockId?: string
}

export interface MissionValidation {
  status: ValidationStatus
  issues: ValidationIssue[]
}

/** `energy_wh` stays null: there is no power model to compute it. */
export interface MissionEstimates {
  length_m: number | null
  duration_s: number | null
  energy_wh: number | null
  /** false when the run can outlast `duration_s` (a program with an unresolved
   * wait or repeat). The scheduler then wants a task-level cap. Route missions
   * are always bounded. */
  duration_bounded: boolean
}

export const DEFAULT_CONSTRAINTS: GroundConstraints = {
  stairs_allowed: false, max_slope_deg: null, min_clearance_m: null, area_type: 'indoor',
  no_go_zone_ids: [], surface_type: 'unknown', human_proximity_policy: 'none',
}

export type Camera = 'front' | 'rear'

/** A voice clip played at a clock time during a run, independent of position. */
export interface TimedAnnouncement {
  announcement_id: string
  clip_id: string
  text: string | null
  volume: number
  /** Local time of day, "HH:MM". */
  at: string
  repeat_every_min: number | null
  /** Local "HH:MM" after which a repeating announcement stops. */
  until: string | null
}

/** Whole-run recording settings; video_clip tasks are cut from this recording. */
export interface RunRecording {
  enabled: boolean
  cameras: Camera[]
}

export const DEFAULT_RECORDING: RunRecording = { enabled: true, cameras: ['front'] }

export interface MissionLibraryEntry {
  mission_id: string
  name: string
  type: MissionType
  kind: MissionKind
  /** Optimistic concurrency: the backend rejects a write whose version is not
   * the stored one (409). Send back what was read; never compute it. */
  version: number
  creator: string
  updated_at: string
  map_id: string
  /** The site the mission belongs to; missions are listed per site. */
  site_id?: string
  waypoints: MissionWaypoint[]
  segments: Segment[]
  constraints?: GroundConstraints
  /** Clock-time announcements; absent on older missions. */
  announcements?: TimedAnnouncement[]
  /** Whole-run recording; absent means DEFAULT_RECORDING. */
  recording?: RunRecording
  validation?: MissionValidation
  estimates?: MissionEstimates
  /** Present only for missions authored via the Visual Program (Blockly)
   * editor — the workspace's serialized JSON state (Blockly.serialization),
   * lets reopening a saved mission restore the block canvas instead of just
   * the compiled waypoint list. */
  program_state?: string
  /** The same program compiled to steps, so the edge can run it without a browser. */
  program_steps?: ProgramSteps | null
}

/**
 * Mirrors shared/schemas/missions.py. Hand-maintained — change both together.
 * Waypoint coordinates are in the **map** frame, not the robot's odom frame.
 *
 * `MissionLibraryEntry.site_id` is the one field ahead of the Python model:
 * it is added there in the same change that stores missions on the backend.
 */

import type { GaitMode } from './robotState'

export type MissionType = 'patrol' | 'inspection' | 'escort' | 'return_to_dock' | 'emergency'
export type MissionStatus = 'active' | 'paused' | 'completed' | 'aborted'
export type WaypointStatus = 'pending' | 'active' | 'done' | 'skipped'

// PRD MIS-007 MVP set. `thermal_scan` is R2 and is deliberately absent from
// the wire type — see ActionMenuEntry in WaypointInspector.tsx for how the
// action menu still lists it, disabled, without the wire union admitting it.
export type WaypointActionType =
  | 'snapshot' | 'voice_prompt' | 'led_signal'
  | 'wait' | 'operator_approval' | 'return_to_dock'

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
 * from the live/in-progress `Mission` LiveOps tracks. A library entry may not
 * be assigned to a robot yet (`robot_id` optional) and carries its own
 * lifecycle status separate from `MissionStatus` (which only makes sense once
 * a mission is actually running).
 */
export type MissionLibraryStatus = 'draft' | 'scheduled' | 'completed' | 'failed'

export type AreaType = 'indoor' | 'outdoor'
export type SurfaceType = 'hard' | 'carpet' | 'gravel' | 'grass' | 'unknown'
export type HumanProximityPolicy = 'none' | 'slow' | 'pause' | 'alert' | 'require_takeover'
export type ScheduleRecurrence = 'once' | 'daily' | 'weekly'
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

/** PRD MIS-011. `start_at` is an ISO datetime; `timezone` an IANA name so a
 * 09:00 patrol stays at 09:00 across DST. days_of_week: Mon=0..Sun=6. */
export interface MissionSchedule {
  schedule_id: string
  recurrence: ScheduleRecurrence
  start_at: string
  timezone: string
  days_of_week: number[]
  window_minutes: number | null
}

/** PRD MIS-013 prerequisites. Defaults refuse rather than permit. */
export interface DispatchRule {
  min_battery_pct: number | null
  require_network: boolean
  require_approval: boolean
  block_if_maintenance_flagged: boolean
  max_wind_kph: number | null
  require_safety_checklist: boolean
}

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  message: string
  waypoint_id: string | null
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
}

export const DEFAULT_CONSTRAINTS: GroundConstraints = {
  stairs_allowed: false, max_slope_deg: null, min_clearance_m: null, area_type: 'indoor',
  no_go_zone_ids: [], surface_type: 'unknown', human_proximity_policy: 'none',
}

export const DEFAULT_DISPATCH_RULE: DispatchRule = {
  min_battery_pct: null, require_network: true, require_approval: false,
  block_if_maintenance_flagged: true, max_wind_kph: null, require_safety_checklist: false,
}

export interface MissionLibraryEntry {
  mission_id: string
  name: string
  type: MissionType
  library_status: MissionLibraryStatus
  creator: string
  updated_at: string
  map_id: string
  /** The site the mission belongs to; missions are listed per site. */
  site_id?: string
  robot_id?: string
  waypoints: MissionWaypoint[]
  segments: Segment[]
  constraints?: GroundConstraints
  schedule?: MissionSchedule | null
  dispatch_rule?: DispatchRule | null
  validation?: MissionValidation
  estimates?: MissionEstimates
  /** Present only for missions authored via the Visual Program (Blockly)
   * editor — the workspace's serialized JSON state (Blockly.serialization),
   * lets reopening a saved mission restore the block canvas instead of just
   * the compiled waypoint list. */
  program_state?: string
}

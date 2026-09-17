/**
 * Mirrors shared/schemas/missions.py. Hand-maintained — change both together.
 * Waypoint coordinates are in the **map** frame, not the robot's odom frame.
 *
 * Not a full mirror: `Mission.constraints` (GroundConstraints) and
 * `MissionLibraryEntry.constraints`/`schedule`/`dispatch_rule`/`validation`/
 * `estimates` exist in the Python model and are deliberately NOT mirrored
 * here yet — there is no DispatchRuleBuilder or constraints UI to consume
 * them, so typing them here would just be dead surface. Add them when that
 * UI lands.
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

export interface MissionLibraryEntry {
  mission_id: string
  name: string
  type: MissionType
  library_status: MissionLibraryStatus
  creator: string
  updated_at: string
  map_id: string
  robot_id?: string
  waypoints: MissionWaypoint[]
  segments: Segment[]
  /** Present only for missions authored via the Visual Program (Blockly)
   * editor — the workspace's serialized JSON state (Blockly.serialization),
   * lets reopening a saved mission restore the block canvas instead of just
   * the compiled waypoint list. */
  program_state?: string
}

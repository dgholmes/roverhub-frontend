/**
 * PROVISIONAL — shared/schemas/missions.py is currently empty (0 bytes).
 * LiveOps only needs a read-only mission summary (docs/05-ui-ux.md §1.4 —
 * full mission authoring belongs to the Missions workspace, not here).
 */

export type MissionType = 'patrol' | 'inspection' | 'escort' | 'return_to_dock' | 'emergency'
export type MissionStatus = 'active' | 'paused' | 'completed' | 'aborted'
export type WaypointStatus = 'pending' | 'active' | 'done' | 'skipped'

export interface WaypointAction {
  type: 'camera_snapshot' | 'thermal_scan' | 'voice_prompt' | 'led_signal' | 'wait'
  label: string
}

export interface MissionWaypoint {
  id: string
  label: string
  x_m: number
  y_m: number
  actions: WaypointAction[]
  status: WaypointStatus
}

export interface Mission {
  mission_id: string
  name: string
  type: MissionType
  status: MissionStatus
  robot_id: string
  waypoints: MissionWaypoint[]
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
  robot_id?: string
  waypoints: MissionWaypoint[]
  /** Present only for missions authored via the Visual Program (Blockly)
   * editor — the workspace's serialized JSON state (Blockly.serialization),
   * lets reopening a saved mission restore the block canvas instead of just
   * the compiled waypoint list. */
  program_state?: string
}

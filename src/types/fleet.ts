/**
 * PROVISIONAL — mirrors docs/01-prd.md §9 (Fleet Requirements) and
 * docs/05-ui-ux.md §10 (Fleet Workspace Design). No shared/schemas/*.py
 * covers Dock/EdgeBridge/fleet-detail yet — this is a clean-slate mirror,
 * not a migration of an existing contract.
 */

export type SensorName = 'rgb_camera' | 'depth_camera' | 'imu' | 'motor' | 'led' | 'voice'
export type SensorHealthState = 'ok' | 'degraded' | 'fault' | 'unsupported'

export interface SensorHealth {
  sensor: SensorName
  label: string
  state: SensorHealthState
  detail?: string
}

export type MaintenanceSeverity = 'info' | 'warning' | 'critical'

export interface MaintenanceRecord {
  id: string
  opened_at: string
  severity: MaintenanceSeverity
  subsystem: string
  note: string
  resolved: boolean
}

/**
 * Fleet-only detail, deliberately separate from `RobotState` — LiveOps must
 * only ever see compact summaries (docs/01-prd.md §9 acceptance criteria:
 * "not duplicated as full panels in LiveOps"), so this superset of detail
 * lives here rather than bloating the telemetry-ticked RobotState.
 */
export interface FleetRobotDetail {
  robot_id: string
  serial: string
  edge_bridge_id: string
  firmware_version: string
  sdk_version: string
  battery_cycles: number
  bms_state: 'nominal' | 'warning' | 'fault'
  motor_warnings: string[]
  sensors: SensorHealth[]
  maintenance_log: MaintenanceRecord[]
}

/** MVP dock = location record only (docs/01-prd.md §9.6). No online/offline,
 * occupancy, or charging-state API until R2 smart dock hardware. */
export interface Dock {
  dock_id: string
  name: string
  site_id: string
  x_m: number
  y_m: number
  heading_deg: number
  charging_cable: boolean
  last_robot_id: string | null
  last_used_at: string | null
  notes?: string
}

export interface EdgeBridge {
  bridge_id: string
  name: string
  host_os: string
  ip_address: string
  site_id: string
  assigned_robot_id: string | null
  cloud_connection: 'connected' | 'reconnecting' | 'offline'
  last_heartbeat: string
  dds_status: 'connected' | 'unavailable'
  grpc_status: 'connected' | 'degraded' | 'unavailable'
  software_version: string
  last_restart_at: string
}

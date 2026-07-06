import type { Mission } from '@/types'

export const initialMissions: Record<string, Mission> = {
  'zaezae-x1-001': {
    mission_id: 'mission-perimeter-north-01',
    name: 'Perimeter Patrol — North Yard',
    type: 'patrol',
    status: 'active',
    robot_id: 'zaezae-x1-001',
    current_waypoint_index: 3,
    started_at: new Date(Date.now() - 22 * 60_000).toISOString(),
    eta_min: 14,
    dock_coord: { x_m: 0, y_m: 0, heading_deg: 0 },
    waypoints: [
      { id: 'wp-1', label: 'Gate A',        x_m: 4,    y_m: -2,   actions: [], status: 'done' },
      { id: 'wp-2', label: 'North Fence',   x_m: 14,   y_m: -6,   actions: [{ type: 'camera_snapshot', label: 'Snapshot' }], status: 'done' },
      { id: 'wp-3', label: 'Loading Dock',  x_m: 24,   y_m: -9,   actions: [], status: 'done' },
      { id: 'wp-4', label: 'Valve Cluster', x_m: 34.2, y_m: -12.7, actions: [{ type: 'thermal_scan', label: 'Thermal scan' }], status: 'active' },
      { id: 'wp-5', label: 'East Wall',     x_m: 44,   y_m: -10,  actions: [], status: 'pending' },
      { id: 'wp-6', label: 'Generator Pad', x_m: 50,   y_m: -2,   actions: [{ type: 'voice_prompt', label: 'Voice prompt' }], status: 'pending' },
      { id: 'wp-7', label: 'South Gate',    x_m: 40,   y_m: 8,    actions: [], status: 'pending' },
      { id: 'wp-8', label: 'Return Lane',   x_m: 18,   y_m: 6,    actions: [], status: 'pending' },
    ],
  },
}

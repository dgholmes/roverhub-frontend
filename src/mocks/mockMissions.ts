import type { Mission } from '@/types'

export const initialMissions: Record<string, Mission> = {
  'zaezae-x1-001': {
    mission_id: 'mission-perimeter-north-01',
    name: 'Perimeter Patrol — North Yard',
    type: 'patrol',
    status: 'active',
    robot_id: 'zaezae-x1-001',
    map_id: 'map-north-yard',
    current_waypoint_index: 3,
    started_at: new Date(Date.now() - 22 * 60_000).toISOString(),
    eta_min: 14,
    dock_coord: { x_m: 0, y_m: 0, heading_deg: 0 },
    segments: [],
    waypoints: [
      { waypoint_id: 'wp-1', label: 'Gate A',        x_m: 4,    y_m: -2,   z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'done' },
      { waypoint_id: 'wp-2', label: 'North Fence',   x_m: 14,   y_m: -6,   z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'snapshot', label: 'Snapshot', params: {} }], status: 'done' },
      { waypoint_id: 'wp-3', label: 'Loading Dock',  x_m: 24,   y_m: -9,   z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'done' },
      { waypoint_id: 'wp-4', label: 'Valve Cluster', x_m: 34.2, y_m: -12.7, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'snapshot', label: 'Snapshot', params: {} }], status: 'active' },
      { waypoint_id: 'wp-5', label: 'East Wall',     x_m: 44,   y_m: -10,  z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
      { waypoint_id: 'wp-6', label: 'Generator Pad', x_m: 50,   y_m: -2,   z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'voice_prompt', label: 'Voice prompt', params: {} }], status: 'pending' },
      { waypoint_id: 'wp-7', label: 'South Gate',    x_m: 40,   y_m: 8,    z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
      { waypoint_id: 'wp-8', label: 'Return Lane',   x_m: 18,   y_m: 6,    z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
    ],
  },
}

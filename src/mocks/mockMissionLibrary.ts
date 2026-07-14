import type { MissionLibraryEntry } from '@/types'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

export const mockMissionLibrary: MissionLibraryEntry[] = [
  {
    mission_id: 'mission-perimeter-north-01',
    name: 'Perimeter Patrol — North Yard',
    type: 'patrol',
    library_status: 'scheduled',
    creator: 'MinJae Joo',
    updated_at: ago(60 * 3),
    robot_id: 'zaezae-x1-001',
    waypoints: [
      { id: 'wp-1', label: 'Gate A', x_m: 4, y_m: -2, actions: [], status: 'pending' },
      { id: 'wp-2', label: 'North Fence', x_m: 14, y_m: -6, actions: [{ type: 'camera_snapshot', label: 'Snapshot' }], status: 'pending' },
      { id: 'wp-3', label: 'Loading Dock', x_m: 24, y_m: -9, actions: [], status: 'pending' },
      { id: 'wp-4', label: 'Valve Cluster', x_m: 34.2, y_m: -12.7, actions: [{ type: 'thermal_scan', label: 'Thermal scan' }], status: 'pending' },
    ],
  },
  {
    mission_id: 'mission-inspection-tanks-01',
    name: 'Tank Farm Inspection',
    type: 'inspection',
    library_status: 'draft',
    creator: 'MinJae Joo',
    updated_at: ago(60 * 26),
    waypoints: [
      { id: 'wp-1', label: 'Tank 1', x_m: 8, y_m: 4, actions: [{ type: 'camera_snapshot', label: 'Snapshot' }], status: 'pending' },
      { id: 'wp-2', label: 'Tank 2', x_m: 16, y_m: 4, actions: [{ type: 'camera_snapshot', label: 'Snapshot' }], status: 'pending' },
    ],
  },
  {
    mission_id: 'mission-escort-01',
    name: 'Visitor Escort — Main Gate to Office',
    type: 'escort',
    library_status: 'completed',
    creator: 'J. Alvarez',
    updated_at: ago(60 * 24 * 4),
    robot_id: 'zaezae-x1-002',
    waypoints: [
      { id: 'wp-1', label: 'Main Gate', x_m: 0, y_m: 0, actions: [], status: 'done' },
      { id: 'wp-2', label: 'Reception', x_m: 20, y_m: 2, actions: [{ type: 'voice_prompt', label: 'Welcome message' }], status: 'done' },
    ],
  },
  {
    mission_id: 'mission-return-dock-fail-01',
    name: 'Return to Dock — Bolt',
    type: 'return_to_dock',
    library_status: 'failed',
    creator: 'System',
    updated_at: ago(60 * 24 * 6),
    robot_id: 'zaezae-x1-003',
    waypoints: [
      { id: 'wp-1', label: 'Dock Approach', x_m: 2, y_m: 1, actions: [], status: 'skipped' },
    ],
  },
]

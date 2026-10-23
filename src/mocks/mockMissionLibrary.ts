import type { MissionLibraryEntry } from '@/types'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

export const mockMissionLibrary: MissionLibraryEntry[] = [
  {
    mission_id: 'mission-perimeter-north-01',
    name: 'Perimeter Patrol — North Yard',
    type: 'patrol',
    kind: 'route',
    version: 1,
    creator: 'MinJae Joo',
    updated_at: ago(60 * 3),
    map_id: 'map-north-yard',
    segments: [],
    waypoints: [
      { waypoint_id: 'wp-1', label: 'Gate A', x_m: 4, y_m: -2, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
      { waypoint_id: 'wp-2', label: 'North Fence', x_m: 14, y_m: -6, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'snapshot', label: 'Snapshot', params: {} }], status: 'pending' },
      { waypoint_id: 'wp-3', label: 'Loading Dock', x_m: 24, y_m: -9, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
      { waypoint_id: 'wp-4', label: 'Valve Cluster', x_m: 34.2, y_m: -12.7, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'snapshot', label: 'Snapshot', params: {} }], status: 'pending' },
    ],
  },
  {
    mission_id: 'mission-inspection-tanks-01',
    name: 'Tank Farm Inspection',
    type: 'inspection',
    kind: 'route',
    version: 1,
    creator: 'MinJae Joo',
    updated_at: ago(60 * 26),
    map_id: 'map-tank-farm',
    segments: [],
    waypoints: [
      { waypoint_id: 'wp-1', label: 'Tank 1', x_m: 8, y_m: 4, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'snapshot', label: 'Snapshot', params: {} }], status: 'pending' },
      { waypoint_id: 'wp-2', label: 'Tank 2', x_m: 16, y_m: 4, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'snapshot', label: 'Snapshot', params: {} }], status: 'pending' },
    ],
  },
  {
    mission_id: 'mission-escort-01',
    name: 'Visitor Escort — Main Gate to Office',
    type: 'escort',
    kind: 'route',
    version: 1,
    creator: 'J. Alvarez',
    updated_at: ago(60 * 24 * 4),
    map_id: 'map-main-campus',
    segments: [],
    waypoints: [
      { waypoint_id: 'wp-1', label: 'Main Gate', x_m: 0, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'done' },
      { waypoint_id: 'wp-2', label: 'Reception', x_m: 20, y_m: 2, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [{ type: 'voice_prompt', label: 'Welcome message', params: { clip_id: 'sample-welcome.wav', text: 'Welcome to the site.', volume: 100 } }], status: 'done' },
    ],
  },
  {
    mission_id: 'mission-return-dock-fail-01',
    name: 'Return to Dock — Bolt',
    type: 'return_to_dock',
    kind: 'route',
    version: 1,
    creator: 'System',
    updated_at: ago(60 * 24 * 6),
    map_id: 'map-north-yard',
    segments: [],
    waypoints: [
      { waypoint_id: 'wp-1', label: 'Dock Approach', x_m: 2, y_m: 1, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'skipped' },
    ],
  },
]

import type { MissionLibraryEntry } from '@/types'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
/** Monday of the current week, so the sample schedules start in the past. */
const weekOf = (() => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7)
  return d.toISOString().slice(0, 10)
})()

export const mockMissionLibrary: MissionLibraryEntry[] = [
  {
    mission_id: 'mission-perimeter-north-01',
    name: 'Perimeter Patrol — North Yard',
    type: 'patrol',
    library_status: 'scheduled',
    creator: 'MinJae Joo',
    updated_at: ago(60 * 3),
    map_id: 'map-north-yard',
    robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-perimeter', recurrence: 'weekly', start_at: `${weekOf}T06:00`, timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4], window_minutes: null },
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
    library_status: 'scheduled',
    creator: 'MinJae Joo',
    updated_at: ago(60 * 26),
    map_id: 'map-tank-farm',
    // Tue/Thu 06:10 on Atlas overlaps the weekday perimeter patrol, so the
    // calendar has a clash to show.
    robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-tanks', recurrence: 'weekly', start_at: `${weekOf}T06:10`, timezone: 'Asia/Seoul', days_of_week: [1, 3], window_minutes: null },
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
    library_status: 'completed',
    creator: 'J. Alvarez',
    updated_at: ago(60 * 24 * 4),
    map_id: 'map-main-campus',
    robot_id: 'zaezae-x1-002',
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
    library_status: 'failed',
    creator: 'System',
    updated_at: ago(60 * 24 * 6),
    map_id: 'map-north-yard',
    robot_id: 'zaezae-x1-003',
    segments: [],
    waypoints: [
      { waypoint_id: 'wp-1', label: 'Dock Approach', x_m: 2, y_m: 1, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'skipped' },
    ],
  },
]

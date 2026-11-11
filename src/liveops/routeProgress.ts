import type { Mission, MissionWaypoint, WaypointStatus } from '@/types'
import type { RobotRunView } from './robotRun'

/**
 * A route run's progress as the LiveOps map's existing RouteLayer draws it
 * (schema 0.0.16): the run's mission record gives the waypoints, the robot's
 * /state names the one it is on (ActiveRun.waypoint_id), and `arrived` events
 * say which it has reached. Before the active waypoint is done, the active
 * one is active (or done once the robot has arrived and acts there), the rest
 * pending. A finished run that completed shows them all done.
 *
 * Null for anything that is not a route run with its waypoints known, so the
 * map draws no route rather than a made-up one.
 */
export function routeRunMission(view: RobotRunView, robotId: string): Mission | null {
  if (!view?.route || view.route.waypoints.length === 0) return null
  const { waypoints, mapId } = view.route
  const arrived = new Set(view.arrived ?? [])
  const completed = view.phase === 'ended' && view.ended?.result === 'completed'
  const named = view.waypointId ? waypoints.findIndex((w) => w.waypoint_id === view.waypointId) : -1
  // With no waypoint named yet, the first one not reached is where it is going.
  const activeIdx = named >= 0 ? named : waypoints.findIndex((w) => !arrived.has(w.waypoint_id))

  const statusOf = (i: number, id: string): WaypointStatus => {
    if (completed || arrived.has(id) || (activeIdx >= 0 && i < activeIdx)) return 'done'
    if (i === activeIdx && view.phase !== 'ended') return 'active'
    return 'pending'
  }
  const out: MissionWaypoint[] = waypoints.map((w, i) => ({
    waypoint_id: w.waypoint_id, label: w.label, x_m: w.x_m, y_m: w.y_m, z_m: null,
    heading_deg: null, tolerance_m: 0.5, actions: [], status: statusOf(i, w.waypoint_id),
  }))
  return {
    mission_id: view.runId, name: view.missionName ?? '', type: 'patrol',
    status: view.phase === 'paused' ? 'paused' : view.phase === 'ended' ? (completed ? 'completed' : 'aborted') : 'active',
    robot_id: robotId, map_id: mapId, waypoints: out, segments: [],
    current_waypoint_index: Math.max(0, activeIdx),
    dock_coord: { x_m: 0, y_m: 0, heading_deg: 0 },
    started_at: view.startedAt, eta_min: null,
  }
}

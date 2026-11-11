import { waypointHeadingToYawRad } from '@/missions/heading'
import type { Step } from '@/missions/program/types'
import type { MissionLibraryEntry } from '@/types'

/** NavStep's lowest arrival tolerance (shared missions.py NAV_MIN_TOLERANCE_M). */
const NAV_MIN_TOLERANCE_M = 0.3

/**
 * The mock's stand-in for the backend's route compiler (roverhub-backend
 * missions/route_steps.py): one walk-to-point leg per waypoint, then the
 * waypoint's waits and snapshots. The real compiler also refuses what a route
 * cannot do yet (validate.ts mirrors that); the mock simply leaves those
 * actions out, since it only has to make demo LiveOps show a route's progress.
 */
export function mockRouteSteps(mission: Pick<MissionLibraryEntry, 'map_id' | 'waypoints'>): Step[] {
  const steps: Step[] = []
  for (const wp of mission.waypoints) {
    const id = wp.waypoint_id
    steps.push({
      kind: 'navigate', blockId: `wp:${id}:go`, label: wp.label, waypointId: id,
      goal: { x_m: wp.x_m, y_m: wp.y_m, yaw_rad: waypointHeadingToYawRad(wp.heading_deg), map_id: mission.map_id, floor_id: '0' },
      toleranceM: Math.max(wp.tolerance_m, NAV_MIN_TOLERANCE_M),
    })
    wp.actions.forEach((a, k) => {
      const blockId = `wp:${id}:a${k}`
      if (a.type === 'wait') steps.push({ kind: 'wait', blockId, seconds: Number(a.params.seconds ?? 1), label: a.label })
      else if (a.type === 'snapshot') {
        // Missions name the rear camera "rear"; the bridge's SNAPSHOT says "back".
        const camera = a.params.camera === 'rear' ? 'back' : 'front'
        steps.push({ kind: 'command', blockId, type: 'SNAPSHOT', params: { camera }, label: a.label })
      }
    })
  }
  return steps
}

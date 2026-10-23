import type { MissionEstimates, MissionLibraryEntry, MissionWaypoint, Segment, WaypointAction } from '@/types'
import { dist } from './geometry'

/** Speed assumed for a leg with none set: the walk gait's comfortable pace on
 * the X1, not its maximum. */
export const DEFAULT_SPEED_MPS = 0.5

/** Seconds each action is assumed to take. Operator approval has no fixed
 * time, so it counts as nothing and the estimate is a lower bound. */
export function actionSeconds(a: WaypointAction): number {
  switch (a.type) {
    case 'wait': return typeof a.params.seconds === 'number' ? a.params.seconds : 10
    case 'snapshot': return 3
    case 'voice_prompt': return 5
    case 'video_clip': return typeof a.params.seconds === 'number' ? a.params.seconds : 15
    case 'led_signal': return 2
    case 'operator_approval': return 0
    case 'return_to_dock': return 0
  }
}

/** The leg arriving at `to`, if one is set. */
export function segmentInto(segments: Segment[], from: MissionWaypoint, to: MissionWaypoint): Segment | undefined {
  return segments.find((s) => s.from_waypoint_id === from.waypoint_id && s.to_waypoint_id === to.waypoint_id)
}

/** Path length, and time from leg speeds plus action times. energy_wh stays
 * null: there is no power model. */
export function computeEstimates(m: Pick<MissionLibraryEntry, 'waypoints' | 'segments'>): MissionEstimates {
  const wps = m.waypoints
  if (wps.length === 0) return { length_m: null, duration_s: null, energy_wh: null, duration_bounded: true }
  let length = 0
  let seconds = 0
  for (let i = 1; i < wps.length; i++) {
    const d = dist(wps[i - 1], wps[i])
    const speed = segmentInto(m.segments, wps[i - 1], wps[i])?.speed_mps || DEFAULT_SPEED_MPS
    length += d
    seconds += d / speed
  }
  for (const wp of wps) for (const a of wp.actions) seconds += actionSeconds(a)
  return { length_m: length, duration_s: seconds, energy_wh: null, duration_bounded: true }
}

/** Cumulative distance from the start to each waypoint. */
export function distanceAlong(wps: MissionWaypoint[]): number[] {
  const out: number[] = []
  let acc = 0
  wps.forEach((wp, i) => { if (i > 0) acc += dist(wps[i - 1], wp); out.push(acc) })
  return out
}

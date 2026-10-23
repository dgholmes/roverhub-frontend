import type { MissionEstimates, MissionLibraryEntry, MissionWaypoint, Segment, WaypointAction } from '@/types'
import { dist } from './geometry'
import { dryRun, type DryRunWarningCode } from './program/dryRun'
import type { Step } from './program/types'

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

/** Dry-run warnings that mean the run can outlast the figure the dry run gave. */
const UNBOUNDED_WARNINGS: ReadonlySet<DryRunWarningCode> = new Set(['waitUntilUnresolved', 'repeatUntilUnresolved', 'commandLimit'])

/**
 * Length and duration of a mission. `energy_wh` stays null: there is no power
 * model.
 *
 * A route is geometry plus action times -- cheap and pure, so it is recomputed
 * wherever a mission is read.
 *
 * A program has no map frame, so its figures come from `dryRun` over the
 * compiled `Step[]`, and `duration_bounded` is false when the dry run could
 * not resolve a wait or loop. A `Step[]` needs the Blockly workspace, which
 * only the editor loads, so the editor computes this once at save time and the
 * library, the calendar and the backend's queue gate read it from storage. Hence
 * the rule below: a program asked for with no `Step[]` gets its stored
 * estimate back, never nulls -- the library and calendar would blank out.
 */
export function computeEstimates(
  m: Pick<MissionLibraryEntry, 'kind' | 'waypoints' | 'segments' | 'estimates'>,
  program?: Step[],
): MissionEstimates {
  if (m.kind === 'program') return program ? estimateProgram(program) : storedProgramEstimate(m.estimates)
  return estimateRoute(m)
}

function estimateProgram(program: Step[]): MissionEstimates {
  // No robot: the live battery, posture and speed ratio are not the program's
  // to know at authoring time. Every condition then reads as unresolved, which
  // can only make a program look unbounded, never falsely bounded.
  const r = dryRun(program, undefined)
  return {
    length_m: r.metresWalked,
    duration_s: r.seconds,
    energy_wh: null,
    duration_bounded: !r.warnings.some((w) => UNBOUNDED_WARNINGS.has(w.code)),
  }
}

/**
 * What storage holds for a program, with a missing `duration_bounded` read as
 * false. A mission saved before the field existed has `undefined`, and the
 * backend's `decide()` refuses to queue an unbounded program with no cap: reading
 * `undefined` as bounded would walk through that gate on a value nobody
 * computed. Unknown is not bounded.
 */
function storedProgramEstimate(stored: MissionEstimates | undefined): MissionEstimates {
  if (!stored) return { length_m: null, duration_s: null, energy_wh: null, duration_bounded: false }
  return stored.duration_bounded === true ? stored : { ...stored, duration_bounded: false }
}

function estimateRoute(m: Pick<MissionLibraryEntry, 'waypoints' | 'segments'>): MissionEstimates {
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

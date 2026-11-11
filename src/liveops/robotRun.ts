import type { ActiveRun, PauseKind, RobotState } from '@/types/robotState'
import type { RunEvent, RunResult } from '@/types/runs'
import type { MissionKind, MissionWaypoint } from '@/types'

/** What the run's mission record says, fetched once per run (useRobotRun). A
 * route's waypoints are kept so LiveOps can draw its progress on the map. */
export type RunMissionInfo = {
  name: string
  estimateS: number | null
  kind?: MissionKind
  mapId?: string
  waypoints?: Pick<MissionWaypoint, 'waypoint_id' | 'label' | 'x_m' | 'y_m'>[]
}

/** One view of a robot's mission run, derived from the wire: the retained /state
 * `active_run` says running or paused (so a fresh tab rebuilds it with no events),
 * and a `run_ended` seen live adds the Ended slot. A run that ended while the tab
 * was closed leaves no Ended slot -- nothing is invented. */

export type RobotRunEnded = { result: RunResult; reason: string | null; endedAt: string; stepsDone: number }

export type RobotRunView = {
  phase: 'running' | 'paused' | 'ended'
  runId: string
  missionName: string | null
  stepLabel: string | null
  blockId: string | null
  redoStepLabel: string | null
  startedAt: string
  owner: string | null
  youHoldControl: boolean
  estimateS: number | null
  ended?: RobotRunEnded
  // Route runs (schema 0.0.16). Optional, so a view built without them -- an
  // older bridge's -- reads exactly as before.
  /** The waypoint being walked to or acted at. */
  waypointId?: string | null
  /** Why it is paused: the robot ("blocked") or an operator. An older bridge
   * sends nothing, which is an operator pause, the only kind it has. */
  pausedFor?: PauseKind | null
  /** A blocked pause's machine reason, e.g. "scan_stale: lidar". */
  pauseReason?: string | null
  /** Waypoints the robot has reported arriving at, in order. */
  arrived?: string[]
  /** A route run's waypoints and map, once the mission record is in. */
  route?: { mapId: string; waypoints: NonNullable<RunMissionInfo['waypoints']> } | null
} | null

export interface RobotRunState {
  /** The run being tracked; survives `active_run` going null so a late run_ended still matches. */
  runId: string | null
  active: ActiveRun | null
  owner: string | null
  startedAt: string | null
  stepLabel: string | null
  blockId: string | null
  redoStepLabel: string | null
  stepsDone: number
  /** step_done seqs already counted, so a QoS 1 redelivery cannot count twice. */
  seenSteps: number[]
  /** Waypoint ids from `arrived` events, in order, and their seqs (for redelivery). */
  arrived: string[]
  seenArrivals: number[]
  mission: RunMissionInfo | null
  ended: RobotRunEnded | null
}

export const initialRobotRun: RobotRunState = {
  runId: null, active: null, owner: null, startedAt: null, stepLabel: null, blockId: null,
  redoStepLabel: null, stepsDone: 0, seenSteps: [], arrived: [], seenArrivals: [], mission: null, ended: null,
}

export type RobotRunInput = {
  state?: Pick<RobotState, 'active_run' | 'control_owner'>
  event?: RunEvent
  mission?: RunMissionInfo
  dismiss?: true
  /** Forget everything: the hook is now looking at a different robot. */
  reset?: true
}

export function reduceRobotRun(prev: RobotRunState, input: RobotRunInput, _operatorId: string): RobotRunState {
  if (input.reset) return initialRobotRun
  let s = prev
  if (input.dismiss) s = { ...s, ended: null }

  if (input.state) {
    const { active_run: run, control_owner } = input.state
    if (run) {
      const fresh = run.run_id !== s.runId
      const same = !fresh && s.owner === control_owner && s.active !== null && s.active.status === run.status &&
        s.stepLabel === run.step_label && s.blockId === run.block_id && s.redoStepLabel === run.redo_step_label &&
        s.startedAt === run.started_at &&
        (s.active.waypoint_id ?? null) === (run.waypoint_id ?? null) && (s.active.step_kind ?? null) === (run.step_kind ?? null) &&
        (s.active.paused_for ?? null) === (run.paused_for ?? null) && (s.active.pause_reason ?? null) === (run.pause_reason ?? null)
      if (!same) s = {
        ...(fresh ? { ...initialRobotRun } : s),
        runId: run.run_id, active: run, owner: control_owner, startedAt: run.started_at,
        stepLabel: run.step_label, blockId: run.block_id, redoStepLabel: run.redo_step_label,
      }
    } else if (s.active !== null || s.owner !== control_owner) {
      s = { ...s, active: null, owner: control_owner }
    }
  }

  const e = input.event
  if (e) {
    if (e.kind === 'run_started' && s.runId === null) {
      s = { ...initialRobotRun, runId: e.run_id, startedAt: e.at }
    } else if (e.run_id === s.runId) {
      if (e.kind === 'step_done') {
        if (!s.seenSteps.includes(e.seq)) s = { ...s, stepsDone: s.stepsDone + 1, seenSteps: [...s.seenSteps, e.seq] }
      }
      else if (e.kind === 'arrived' && e.waypoint_id) {
        if (!s.seenArrivals.includes(e.seq)) s = { ...s, arrived: [...s.arrived, e.waypoint_id], seenArrivals: [...s.seenArrivals, e.seq] }
      }
      else if (e.kind === 'run_ended') {
        s = { ...s, ended: { result: e.result ?? 'aborted', reason: e.reason, endedAt: e.at, stepsDone: s.stepsDone } }
      }
    }
  }

  if (input.mission && s.runId !== null) s = { ...s, mission: input.mission }
  return s
}

export function robotRunView(s: RobotRunState, operatorId: string): RobotRunView {
  if (s.runId === null) return null
  const phase = s.ended ? 'ended' : s.active ? s.active.status : null
  if (phase === null) return null
  return {
    phase, runId: s.runId,
    missionName: s.mission?.name ?? null,
    stepLabel: s.stepLabel, blockId: s.blockId, redoStepLabel: s.redoStepLabel,
    startedAt: s.startedAt ?? '', owner: s.owner,
    youHoldControl: s.owner !== null && s.owner === operatorId,
    estimateS: s.mission?.estimateS ?? null,
    ...(s.ended ? { ended: s.ended } : {}),
    waypointId: s.active?.waypoint_id ?? null,
    // Only a 0.0.16 bridge says why; before that every pause was an operator's.
    pausedFor: s.active?.status === 'paused' ? (s.active.paused_for ?? 'operator') : null,
    pauseReason: s.active?.status === 'paused' ? (s.active.pause_reason ?? null) : null,
    arrived: s.arrived,
    route: s.mission?.kind === 'route' && s.mission.waypoints
      ? { mapId: s.mission.mapId ?? '', waypoints: s.mission.waypoints }
      : null,
  }
}

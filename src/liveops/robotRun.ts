import type { ActiveRun, RobotState } from '@/types/robotState'
import type { RunEvent, RunResult } from '@/types/runs'

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
  mission: { name: string; estimateS: number | null } | null
  ended: RobotRunEnded | null
}

export const initialRobotRun: RobotRunState = {
  runId: null, active: null, owner: null, startedAt: null, stepLabel: null, blockId: null,
  redoStepLabel: null, stepsDone: 0, mission: null, ended: null,
}

export type RobotRunInput = {
  state?: Pick<RobotState, 'active_run' | 'control_owner'>
  event?: RunEvent
  mission?: { name: string; estimateS: number | null }
  dismiss?: true
}

export function reduceRobotRun(prev: RobotRunState, input: RobotRunInput, _operatorId: string): RobotRunState {
  let s = prev
  if (input.dismiss) s = { ...s, ended: null }

  if (input.state) {
    const { active_run: run, control_owner } = input.state
    if (run) {
      const fresh = run.run_id !== s.runId
      s = {
        ...(fresh ? { ...initialRobotRun } : s),
        runId: run.run_id, active: run, owner: control_owner, startedAt: run.started_at,
        stepLabel: run.step_label, blockId: run.block_id, redoStepLabel: run.redo_step_label,
      }
    } else {
      s = { ...s, active: null, owner: control_owner }
    }
  }

  const e = input.event
  if (e) {
    if (e.kind === 'run_started' && s.runId === null) {
      s = { ...initialRobotRun, runId: e.run_id, startedAt: e.at }
    } else if (e.run_id === s.runId) {
      if (e.kind === 'step_done') s = { ...s, stepsDone: s.stepsDone + 1 }
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
  }
}

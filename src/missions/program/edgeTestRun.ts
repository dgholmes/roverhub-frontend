import i18n from '@/i18n'
import { RunStartRefused, type StartRunRequest } from '@/lib/realtime/runStart'
import type { RobotRunView } from '@/liveops/robotRun'
import type { Command, MissionLibraryEntry, MissionRun, RobotType, RunEvent, RunResult } from '@/types'
import { compileProgram } from './compile'
import { PrepareFailed, prepareRunSteps, programBlocksForRun, type MakeClip } from './prepareRun'
import type { ProgramBlock } from './types'

export type TestRunState = 'idle' | 'starting' | 'running' | 'paused' | 'ended'

export interface TestRunInput {
  /** Run was pressed and the start (compile, clips, POST) has not answered yet. */
  starting: boolean
  /** The run this editor started, once the backend accepted it. */
  runId: string | null
  /** The backend's (or the prepare step's) reason the last start was refused. */
  refusal: string | null
  /** Run events seen since Run was pressed, for any run on the robot. */
  events: RunEvent[]
  /** The robot's run as LiveOps sees it (useRobotRun). */
  view: RobotRunView
  /** The robot's /state has shown our run at least once. */
  seenOnRobot: boolean
  /** The backend accepted the start (201) but START_MISSION's ack failed: the
   * edge refused it. Its failure_reason, "CODE: message" (see startFailureOf). */
  startFailure: string | null
  /** The stored run, looked up while the robot has not shown it, had ended:
   * the backend failed it (noAnswer), or the edge's refusal reached it first. */
  polledEnd: { result: RunResult; reason: string | null } | null
}

export interface TestRunModel {
  state: TestRunState
  /** The block to highlight: the step executing now, while running or paused. */
  blockId: string | null
  stepLabel: string | null
  ended: { result: RunResult; reason: string | null; stepsDone: number } | null
  refusal: string | null
}

/**
 * The editor's test run, from what the robot says about it. The run lives on
 * the edge: once accepted it is running until /state says otherwise, paused
 * when /state says paused, and ended on its run_ended, or when /state, having
 * shown it, shows no run or someone else's.
 */
export function testRunModel(x: TestRunInput): TestRunModel {
  const none = { blockId: null, stepLabel: null, ended: null }
  if (x.starting) return { state: 'starting', ...none, refusal: null }
  // With no run id the refusal is the backend's/prepare's, or the edge's once a
  // refused start has dropped the run id (startFailureClearsRun).
  if (!x.runId) return { state: 'idle', ...none, refusal: x.refusal ?? x.startFailure }
  // The edge refused the start after the backend accepted it. Shown as a
  // refusal, like the backend's own, and the editor is free to run again. Not
  // once the robot has shown the run: then it did start.
  if (x.startFailure && !x.seenOnRobot) return { state: 'idle', ...none, refusal: x.startFailure }
  const ours = x.view?.runId === x.runId ? x.view : null
  const endEvent = x.events.find((e) => e.run_id === x.runId && e.kind === 'run_ended')
  const polledEnd = x.seenOnRobot ? null : x.polledEnd
  if (endEvent || ours?.phase === 'ended' || (x.seenOnRobot && !ours) || polledEnd) {
    const stepsDone = new Set(x.events.filter((e) => e.run_id === x.runId && e.kind === 'step_done').map((e) => e.seq)).size
    const ended = endEvent
      ? { result: endEvent.result ?? 'aborted', reason: endEvent.reason, stepsDone }
      : ours?.ended ? { result: ours.ended.result, reason: ours.ended.reason, stepsDone: ours.ended.stepsDone }
      : polledEnd ? { result: polledEnd.result, reason: polledEnd.reason, stepsDone } : null
    return { state: 'ended', ...none, ended, refusal: null }
  }
  return {
    state: ours?.phase === 'paused' ? 'paused' : 'running',
    blockId: ours?.blockId ?? null,
    stepLabel: ours?.stepLabel ?? null,
    ended: null,
    refusal: null,
  }
}

/** A START_MISSION ack that says the edge did not start the run: refused
 * (execution_failed, "CODE: message") or cancelled. Null for anything else --
 * including timed_out, the browser giving up waiting, after which the run may
 * still start; the poll (polledRunEnd) settles that case. */
export function startFailureOf(command: Pick<Command, 'current_stage' | 'failure_reason'>): string | null {
  if (command.current_stage !== 'execution_failed' && command.current_stage !== 'cancelled') return null
  return command.failure_reason || command.current_stage
}

/** The edge refused the start (and the robot never showed the run): the editor
 * drops its run id so a run actually on the robot (REJECTED_RUN_ACTIVE) can be
 * re-attached to (runToAdopt needs no run id). The refusal text stays. */
export function startFailureClearsRun(x: { startFailure: string | null; seenOnRobot: boolean }): boolean {
  return x.startFailure !== null && !x.seenOnRobot
}

/** How often the stored run is looked up while the robot has not shown it. */
export const START_POLL_MS = 3_000

/** The stored run, looked up while the robot has not shown it: its end, once
 * it has one. Catches the backend's noAnswer (no bridge acked START_MISSION in
 * 30 s), which reaches the browser on no other path. */
export function polledRunEnd(detail: { run: Pick<MissionRun, 'result' | 'end_reason'> }): TestRunInput['polledEnd'] {
  const { result, end_reason } = detail.run
  return result === 'running' ? null : { result, reason: end_reason }
}

/** Stop of a run the robot has never shown: nothing on the robot to wait on
 * (its ack would be a no-op, and Stopping... would never end), so the editor
 * drops the run at once. A run that started after all is re-adopted from
 * /state (runToAdopt). */
export function stopClearsLocally(x: { seenOnRobot: boolean }): boolean {
  return !x.seenOnRobot
}

/**
 * The robot's run to look up when the editor has none of its own: the editor
 * was left (to take control in LiveOps, say) and opened again while a run goes.
 * Null when there is nothing to re-attach to.
 */
export function runToAdopt(x: { runId: string | null; starting: boolean; view: RobotRunView }): string | null {
  if (x.runId || x.starting || !x.view) return null
  return x.view.phase === 'running' || x.view.phase === 'paused' ? x.view.runId : null
}

/** A looked-up run is this editor's to show only if it runs this mission. */
export function adoptsRun(run: Pick<MissionRun, 'mission_id'>, missionId: string): boolean {
  return run.mission_id === missionId
}

/** Stored and live events as one list: in `seq` order, each (run, seq) once. */
export function mergeRunEvents(stored: RunEvent[], live: RunEvent[]): RunEvent[] {
  const byKey = new Map<string, RunEvent>()
  for (const e of [...stored, ...live]) {
    const key = `${e.run_id}#${e.seq}`
    if (!byKey.has(key)) byKey.set(key, e)
  }
  return [...byKey.values()].sort((x, y) => x.seq - y.seq)
}

export interface AdoptRunDeps {
  getRun(runId: string): Promise<{ run: Pick<MissionRun, 'run_id' | 'mission_id'> }>
  getRunEvents(runId: string): Promise<RunEvent[]>
}

/**
 * Looks up the robot's run and, if it runs this mission, returns its id with
 * the events stored so far, to seed the log. Null when it is another
 * mission's run or cannot be looked up. Stored events that cannot be read
 * leave an empty seed rather than refusing the run: live ones still arrive.
 */
export async function adoptRun(deps: AdoptRunDeps, runId: string, missionId: string): Promise<{ runId: string; events: RunEvent[] } | null> {
  let run: Pick<MissionRun, 'run_id' | 'mission_id'>
  try {
    run = (await deps.getRun(runId)).run
  } catch {
    return null
  }
  if (!adoptsRun(run, missionId)) return null
  const events = await deps.getRunEvents(run.run_id).catch(() => [] as RunEvent[])
  return { runId: run.run_id, events }
}

export interface StartTestRunDeps {
  startRun(robotId: string, req: StartRunRequest): Promise<{ run: MissionRun }>
  makeClip: MakeClip
}

export type StartTestRunResult = { ok: true; runId: string } | { ok: false; reason: string }

/**
 * Starts a test run of the editor's program on a robot, through the backend
 * and the edge executor (spec 5.4): compile the editor's blocks, saved or not,
 * for the robot's type, make the speech clips, then post. Only when no blocks
 * are given at all (null) is the saved program used instead.
 */
export async function startTestRun(deps: StartTestRunDeps, x: {
  mission: MissionLibraryEntry
  robotId: string
  robotType: RobotType | null
  editorBlocks: ProgramBlock[] | null
}): Promise<StartTestRunResult> {
  const blocks = programBlocksForRun(x.mission, x.editorBlocks ?? undefined)
  if (!blocks || blocks.length === 0) return { ok: false, reason: i18n.t('missions.tasks.start.noProgram') }
  // An unknown type would compile as quad, which a wheel robot must not be sent.
  if (x.robotType === null) return { ok: false, reason: i18n.t('missions.tasks.start.robotTypeUnknown') }
  try {
    const steps = await prepareRunSteps(compileProgram(blocks, x.robotType), x.robotId, deps.makeClip)
    const { run } = await deps.startRun(x.robotId, { mission: x.mission, steps, source: 'editor' })
    return { ok: true, runId: run.run_id }
  } catch (e) {
    if (e instanceof PrepareFailed) return { ok: false, reason: i18n.t('missions.tasks.start.speechFailed', { step: e.stepLabel }) }
    if (e instanceof RunStartRefused) return { ok: false, reason: e.message }
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

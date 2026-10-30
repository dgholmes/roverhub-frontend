import i18n from '@/i18n'
import { RunStartRefused, type StartRunRequest } from '@/lib/realtime/runStart'
import type { RobotRunView } from '@/liveops/robotRun'
import type { MissionLibraryEntry, MissionRun, RobotType, RunEvent, RunResult } from '@/types'
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
  if (!x.runId) return { state: 'idle', ...none, refusal: x.refusal }
  const ours = x.view?.runId === x.runId ? x.view : null
  const endEvent = x.events.find((e) => e.run_id === x.runId && e.kind === 'run_ended')
  if (endEvent || ours?.phase === 'ended' || (x.seenOnRobot && !ours)) {
    const stepsDone = new Set(x.events.filter((e) => e.run_id === x.runId && e.kind === 'step_done').map((e) => e.seq)).size
    const ended = endEvent
      ? { result: endEvent.result ?? 'aborted', reason: endEvent.reason, stepsDone }
      : ours?.ended ? { result: ours.ended.result, reason: ours.ended.reason, stepsDone: ours.ended.stepsDone } : null
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

export interface StartTestRunDeps {
  startRun(robotId: string, req: StartRunRequest): Promise<{ run: MissionRun }>
  makeClip: MakeClip
}

export type StartTestRunResult = { ok: true; runId: string } | { ok: false; reason: string }

/**
 * Starts a test run of the editor's program on a robot, through the backend
 * and the edge executor (spec 5.4): compile the editor's blocks, saved or not,
 * for the robot's type, make the speech clips, then post. `editorBlocks` null
 * (the canvas not ready yet) falls back to the saved program.
 */
export async function startTestRun(deps: StartTestRunDeps, x: {
  mission: MissionLibraryEntry
  robotId: string
  robotType: RobotType | null
  editorBlocks: ProgramBlock[] | null
}): Promise<StartTestRunResult> {
  const blocks = programBlocksForRun(x.mission, x.editorBlocks ?? undefined)
  if (!blocks || blocks.length === 0) return { ok: false, reason: i18n.t('missions.tasks.start.noProgram') }
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

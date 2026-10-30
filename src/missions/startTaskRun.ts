import i18n from '@/i18n'
import { RunStartRefused } from '@/lib/realtime/runStart'
import type { MissionLibraryEntry, MissionRun, MissionTask, RobotType, TaskOccurrence } from '@/types'
import { compileProgram } from './program/compile'
import { PrepareFailed, prepareRunSteps, programBlocksForRun, type MakeClip } from './program/prepareRun'
import type { Step } from './program/types'

export interface StartTaskRunDeps {
  runTaskNow: (taskId: string, steps: Step[]) => Promise<{ occurrence: TaskOccurrence; run: MissionRun }>
  makeClip: MakeClip
  robotType: (robotId: string) => RobotType | null
}

export type StartTaskRunResult =
  | { ok: true; robotId: string; runId: string }
  | { ok: false; reason: string }

/**
 * Starts a task's mission on its robot, through the backend (spec 5.2): compile
 * the saved program for the robot's type, make the speech clips, then post.
 * Returns the outcome rather than navigating, so the page that asked can keep a
 * refusal in view; going to LiveOps on success is the caller's.
 */
export async function startTaskRun(deps: StartTaskRunDeps, task: MissionTask, mission: MissionLibraryEntry): Promise<StartTaskRunResult> {
  const robotId = task.robot_id
  if (!robotId) return { ok: false, reason: i18n.t('missions.tasks.start.noRobot') }
  const blocks = programBlocksForRun(mission)
  if (!blocks || blocks.length === 0) return { ok: false, reason: i18n.t('missions.tasks.start.noProgram') }
  try {
    const steps = await prepareRunSteps(compileProgram(blocks, deps.robotType(robotId)), robotId, deps.makeClip)
    const { run } = await deps.runTaskNow(task.task_id, steps)
    return { ok: true, robotId, runId: run.run_id }
  } catch (e) {
    if (e instanceof PrepareFailed) return { ok: false, reason: i18n.t('missions.tasks.start.speechFailed', { step: e.stepLabel }) }
    if (e instanceof RunStartRefused) return { ok: false, reason: e.message }
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

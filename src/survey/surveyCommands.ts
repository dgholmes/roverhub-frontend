import i18n from '@/i18n'
import { refusalText } from '@/lib/refusals'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import type {
  ReprocessSurveyParams, SetSurveyKeepParams, StartSurveyParams, StopSurveyParams, SurveyIdParams,
} from '@/types/survey'

/**
 * Starting and stopping a survey. Both are ordinary wired commands
 * (START_SURVEY / STOP_SURVEY through POST /robots/{id}/commands), so they go
 * through the store's dispatch like every other one: the same toast, the same
 * ack tracking, and in demo mode the mock bridge's survey. What the survey is
 * doing afterwards is read from survey/status, never from the ack.
 *
 * And, since 0.0.29 (the map ready checklist), what is done with a survey's
 * recording afterwards: Process again / Rebuild from recording
 * (REPROCESS_SURVEY), Keep (SET_SURVEY_KEEP), Delete recording
 * (DELETE_SURVEY_RECORDING) and Skip for now on the moved search
 * (SKIP_MOVING_SEARCH). The same path, the same plain-words result. The
 * backend refuses them first for a bridge older than 0.0.29, and those
 * refusals are shown as written.
 */

export interface SurveyCommandResult {
  ok: boolean
  /** Why it did not go through, in the operator's words; null when it did. */
  error: string | null
}

/** The real provider's wording when the backend refuses a POST, with its
 * `detail` after the colon. */
const CLOUD_REFUSED = /^The cloud rejected the command \(HTTP \d+\): ([\s\S]+)$/

/** Why a survey command failed, as the operator should read it. The backend's
 * refusals (403 role, 409 bridge too old, 422 params, 404 map) are already
 * plain sentences and are shown exactly as written; a bridge refusal code is
 * put into words. Exported for tests. */
export function surveyFailureText(raw: string | undefined | null): string {
  if (!raw) return i18n.t('survey.command.failed')
  const cloud = CLOUD_REFUSED.exec(raw.trim())
  if (cloud) return cloud[1]
  return refusalText(i18n.t, raw)
}

/** A command's outcome as `{ ok, error }` in the operator's words. Exported
 * for the other plain-words command helpers (org/robotSite.ts). */
export function commandResultOf(outcome: CommandOutcome): SurveyCommandResult {
  if (outcome.result === 'completed') return { ok: true, error: null }
  if (outcome.result === 'unknown') return { ok: false, error: i18n.t('survey.command.unknown') }
  return { ok: false, error: surveyFailureText(outcome.command.failure_reason) }
}

export async function startSurvey(robotId: string, params: StartSurveyParams): Promise<SurveyCommandResult> {
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(
    robotId, 'START_SURVEY', i18n.t('survey.command.start', { name: params.name }), { ...params },
  )
  return commandResultOf(outcome)
}

export async function stopSurvey(robotId: string, params: StopSurveyParams): Promise<SurveyCommandResult> {
  const label = params.save ? i18n.t('survey.command.save') : i18n.t('survey.command.discard')
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(robotId, 'STOP_SURVEY', label, { ...params })
  return commandResultOf(outcome)
}

/** Process again (`rebuild: false`) or Rebuild from recording (`rebuild:
 * true`): the processing that follows Stop & save, run again on a recording
 * still on the robot, with the map, floor and label given. Its progress is on
 * survey/status as after Stop & save. */
export async function reprocessSurvey(robotId: string, params: ReprocessSurveyParams): Promise<SurveyCommandResult> {
  const label = i18n.t(params.rebuild ? 'survey.command.rebuild' : 'survey.command.reprocess', { survey: params.survey_id })
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(robotId, 'REPROCESS_SURVEY', label, { ...params })
  return commandResultOf(outcome)
}

/** Keep a recording out of the robot's retention (`keep: true`), or hand it back. */
export async function setSurveyKeep(robotId: string, params: SetSurveyKeepParams): Promise<SurveyCommandResult> {
  const label = i18n.t(params.keep ? 'survey.command.keep' : 'survey.command.unkeep', { survey: params.survey_id })
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(robotId, 'SET_SURVEY_KEEP', label, { ...params })
  return commandResultOf(outcome)
}

/** Delete a survey's recording from the robot: the bag, cameras, map.pcd and
 * the rebuild. The processing's results stay on the robot, and the map in the
 * cloud is untouched. Cannot be undone; the caller confirms first. */
export async function deleteSurveyRecording(robotId: string, params: SurveyIdParams):
  Promise<SurveyCommandResult & { bytesFreed?: number | null }> {
  const label = i18n.t('survey.command.deleteRecording', { survey: params.survey_id })
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(robotId, 'DELETE_SURVEY_RECORDING', label, { ...params })
  const result = commandResultOf(outcome)
  if (!result.ok) return result
  // The ack's result is {survey_id, bytes_freed} (robot_bridge recordings.py).
  const freed = outcome.command.result?.bytes_freed
  return { ...result, bytesFreed: typeof freed === 'number' && Number.isFinite(freed) ? freed : null }
}

/** Skip for now: stop the moving-object search of the survey being processed;
 * the floor is uploaded with no moved list (Find now can run it later). */
export async function skipMovingSearch(robotId: string, params: SurveyIdParams): Promise<SurveyCommandResult> {
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(
    robotId, 'SKIP_MOVING_SEARCH', i18n.t('survey.command.skipMoving'), { ...params },
  )
  return commandResultOf(outcome)
}

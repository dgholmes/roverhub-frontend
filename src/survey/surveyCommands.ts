import i18n from '@/i18n'
import { refusalText } from '@/lib/refusals'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import type { StartSurveyParams, StopSurveyParams } from '@/types/survey'

/**
 * Starting and stopping a survey. Both are ordinary wired commands
 * (START_SURVEY / STOP_SURVEY through POST /robots/{id}/commands), so they go
 * through the store's dispatch like every other one: the same toast, the same
 * ack tracking, and in demo mode the mock bridge's survey. What the survey is
 * doing afterwards is read from survey/status, never from the ack.
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

function resultOf(outcome: CommandOutcome): SurveyCommandResult {
  if (outcome.result === 'completed') return { ok: true, error: null }
  if (outcome.result === 'unknown') return { ok: false, error: i18n.t('survey.command.unknown') }
  return { ok: false, error: surveyFailureText(outcome.command.failure_reason) }
}

export async function startSurvey(robotId: string, params: StartSurveyParams): Promise<SurveyCommandResult> {
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(
    robotId, 'START_SURVEY', i18n.t('survey.command.start', { name: params.name }), { ...params },
  )
  return resultOf(outcome)
}

export async function stopSurvey(robotId: string, params: StopSurveyParams): Promise<SurveyCommandResult> {
  const label = params.save ? i18n.t('survey.command.save') : i18n.t('survey.command.discard')
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(robotId, 'STOP_SURVEY', label, { ...params })
  return resultOf(outcome)
}

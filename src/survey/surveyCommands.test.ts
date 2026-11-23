import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { deleteSurveyRecording, reprocessSurvey, setSurveyKeep, skipMovingSearch } from './surveyCommands'

const SURVEY = 'survey-20261120-113333-2881'

let dispatch: ReturnType<typeof vi.fn>
let outcome: CommandOutcome

const completed = (type: string): CommandOutcome => ({
  result: 'completed',
  command: {
    command_id: 'c1', robot_id: 'rover-jetson', type, label: '', stages: [], current_stage: 'execution_completed', initiated_by: 'x',
  } as never,
})

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  outcome = completed('REPROCESS_SURVEY')
  dispatch = vi.fn(async () => outcome)
  useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
})

describe('the map ready survey commands (0.0.29)', () => {
  it('reprocessSurvey sends REPROCESS_SURVEY with the overrides', async () => {
    const result = await reprocessSurvey('rover-jetson', { survey_id: SURVEY, map_id: null, floor_index: 0, floor_label: '2F', rebuild: true })
    expect(result).toEqual({ ok: true, error: null })
    const [robotId, type, label, params] = dispatch.mock.calls[0]
    expect([robotId, type]).toEqual(['rover-jetson', 'REPROCESS_SURVEY'])
    expect(params).toEqual({ survey_id: SURVEY, map_id: null, floor_index: 0, floor_label: '2F', rebuild: true })
    expect(label).toMatch(/rebuild/i)
  })

  it('labels Process again apart from Rebuild from recording', async () => {
    await reprocessSurvey('rover-jetson', { survey_id: SURVEY, map_id: 'map-office', floor_index: 1, floor_label: null, rebuild: false })
    const label = dispatch.mock.calls[0][2] as string
    expect(label).toMatch(/process/i)
    expect(label).not.toMatch(/rebuild/i)
  })

  it('setSurveyKeep sends SET_SURVEY_KEEP, both ways', async () => {
    await setSurveyKeep('rover-jetson', { survey_id: SURVEY, keep: true })
    await setSurveyKeep('rover-jetson', { survey_id: SURVEY, keep: false })
    expect(dispatch.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      ['SET_SURVEY_KEEP', { survey_id: SURVEY, keep: true }],
      ['SET_SURVEY_KEEP', { survey_id: SURVEY, keep: false }],
    ])
    expect(dispatch.mock.calls[0][2]).not.toBe(dispatch.mock.calls[1][2])
  })

  it('deleteSurveyRecording and skipMovingSearch send just the survey', async () => {
    await deleteSurveyRecording('rover-jetson', { survey_id: SURVEY })
    await skipMovingSearch('rover-jetson', { survey_id: SURVEY })
    expect(dispatch.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      ['DELETE_SURVEY_RECORDING', { survey_id: SURVEY }],
      ['SKIP_MOVING_SEARCH', { survey_id: SURVEY }],
    ])
  })

  it('deleteSurveyRecording reads bytes_freed off the ack', async () => {
    outcome = completed('DELETE_SURVEY_RECORDING')
    outcome.command.result = { survey_id: SURVEY, bytes_freed: 4_000_000_000 }
    expect(await deleteSurveyRecording('rover-jetson', { survey_id: SURVEY })).toEqual({ ok: true, error: null, bytesFreed: 4_000_000_000 })
  })

  it('puts a bridge refusal into words, and passes the cloud refusal through as written', async () => {
    outcome = { ...completed('REPROCESS_SURVEY'), result: 'failed' }
    outcome.command.failure_reason = `REJECTED_SURVEY_NO_RECORDING: ${SURVEY} has no bag`
    const refused = await reprocessSurvey('rover-jetson', { survey_id: SURVEY, map_id: null, floor_index: 0, floor_label: null, rebuild: false })
    expect(refused.ok).toBe(false)
    expect(refused.error).toMatch(/recording/i)
    expect(refused.error).not.toMatch(/REJECTED_/)

    outcome.command.failure_reason = 'The cloud rejected the command (HTTP 409): the recording is no longer on the robot'
    const cloud = await deleteSurveyRecording('rover-jetson', { survey_id: SURVEY })
    expect(cloud).toEqual({ ok: false, error: 'the recording is no longer on the robot' })
  })
})

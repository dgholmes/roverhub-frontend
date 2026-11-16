import { describe, expect, it } from 'vitest'
import type { RobotState } from '@/types'
import type { MapJob } from '@/types/mapPipeline'
import {
  IDLE_FIND, findMovingBlock, findReducer, parseFloorSurvey, resolveSurveySource, surveySource, type FindState, type FindStatus,
} from './findMoving'

const job = (over: Partial<MapJob> = {}): MapJob => ({
  job_id: 'j', kind: 'survey', map_id: 'map-a', site_id: 's', status: 'succeeded', stage: 'done',
  created_at: '2026-11-16T01:00:00Z', started_at: null, finished_at: '2026-11-16T01:05:00Z', error: null, result: null,
  requested_by: 'rover-jetson', detail: { floor: 0, survey_id: 'sv-1', robot_id: 'rover-jetson' }, ...over,
})
const robot = (robot_id: string, schema = '0.0.23', bridge: 'connected' | 'offline' = 'connected') =>
  ({ robot_id, name: robot_id, connectivity: { bridge_state: bridge }, bridge: { schema_version: schema } }) as unknown as RobotState

describe('which survey and robot', () => {
  it('takes the newest succeeded survey job for the floor that names a survey', () => {
    const jobs = [
      job({ job_id: 'old', finished_at: '2026-11-15T00:00:00Z', detail: { floor: 0, survey_id: 'sv-old', robot_id: 'rover-pi' } }),
      job(),
      job({ job_id: 'failed', status: 'failed', finished_at: '2026-11-17T00:00:00Z', detail: { floor: 0, survey_id: 'sv-x' } }),
      job({ job_id: 'other floor', finished_at: '2026-11-17T00:00:00Z', detail: { floor: 1, survey_id: 'sv-f1' } }),
      job({ job_id: 'edit', kind: 'cloud_edits', finished_at: '2026-11-17T00:00:00Z' }),
    ]
    expect(surveySource(jobs, 0)).toEqual({ surveyId: 'sv-1', robotId: 'rover-jetson' })
    expect(surveySource(jobs, 1)).toEqual({ surveyId: 'sv-f1', robotId: 'rover-jetson' })
  })

  it('has none for a map uploaded by hand, and falls back to who uploaded for the robot', () => {
    expect(surveySource([job({ detail: { floor: 0, name: 'Office' } })], 0)).toBeNull()
    expect(surveySource([job({ detail: { floor: 0, survey_id: 'sv-1' } })], 0)).toEqual({ surveyId: 'sv-1', robotId: 'rover-jetson' })
  })
})

describe('the floor own record (survey.json)', () => {
  it('reads the survey key, and calls a missing key or a null survey_id unknown', () => {
    expect(parseFloorSurvey({ floor: 0, survey: { survey_id: 'sv-9', robot_id: 'rover-pi' } })).toEqual({ surveyId: 'sv-9', robotId: 'rover-pi' })
    expect(parseFloorSurvey({ floor: 0, survey: { survey_id: 'sv-9', robot_id: null } })).toEqual({ surveyId: 'sv-9', robotId: null })
    expect(parseFloorSurvey({ floor: 0 })).toBeNull()
    expect(parseFloorSurvey({ floor: 0, survey: { survey_id: null, robot_id: 'rover-pi' } })).toBeNull()
    expect(parseFloorSurvey(null)).toBeNull()
  })

  it('wins over the jobs; the jobs answer only when there is no record', () => {
    const jobs = [job()]
    expect(resolveSurveySource({ surveyId: 'sv-9', robotId: 'rover-pi' }, jobs, 0)).toEqual({ surveyId: 'sv-9', robotId: 'rover-pi' })
    // Unknown is unknown: not a reason to guess from a job.
    expect(resolveSurveySource(null, jobs, 0)).toBeNull()
    expect(resolveSurveySource(undefined, jobs, 0)).toEqual({ surveyId: 'sv-1', robotId: 'rover-jetson' })
    // A record with no robot borrows the robot of the job for the same survey only.
    expect(resolveSurveySource({ surveyId: 'sv-1', robotId: null }, jobs, 0)).toEqual({ surveyId: 'sv-1', robotId: 'rover-jetson' })
    expect(resolveSurveySource({ surveyId: 'sv-9', robotId: null }, jobs, 0)).toEqual({ surveyId: 'sv-9', robotId: null })
  })
})

describe('when the button works', () => {
  const source = { surveyId: 'sv-1', robotId: 'rover-jetson' }
  const args = { source, robots: [robot('rover-jetson')], dirty: false, busy: false }
  it('says why not, most lasting reason first', () => {
    expect(findMovingBlock(args)).toBeNull()
    expect(findMovingBlock({ ...args, source: 'loading' })).toEqual({ reason: 'loading' })
    expect(findMovingBlock({ ...args, source: null })).toEqual({ reason: 'noSurvey' })
    expect(findMovingBlock({ ...args, source: { surveyId: 'sv-1', robotId: null } })).toEqual({ reason: 'noRobot' })
    expect(findMovingBlock({ ...args, robots: [] })).toEqual({ reason: 'robotGone', robot: 'rover-jetson' })
    expect(findMovingBlock({ ...args, robots: [robot('rover-jetson', '0.0.22')], dirty: true })).toEqual({ reason: 'oldBridge', robot: 'rover-jetson' })
    expect(findMovingBlock({ ...args, robots: [robot('rover-jetson', '0.0.23', 'offline')] })).toEqual({ reason: 'offline', robot: 'rover-jetson' })
    expect(findMovingBlock({ ...args, dirty: true })).toEqual({ reason: 'unsaved' })
    expect(findMovingBlock({ ...args, busy: true })).toEqual({ reason: 'busy' })
  })
})

describe('following the search', () => {
  const T0 = Date.parse('2026-11-16T09:00:00Z')
  const started = (): FindState => findReducer(IDLE_FIND, { type: 'start', surveyId: 'sv-1', at: T0 })
  const status = (over: Partial<FindStatus>): FindStatus => ({ state: 'processing', survey_id: 'sv-1', updated_at: '2026-11-16T09:00:05Z', ...over })
  const outcome = (result: 'completed' | 'failed' | 'unknown', command: { failure_reason?: string; result?: Record<string, unknown> } = {}) =>
    ({ type: 'outcome' as const, outcome: { result, command }, statusSource: true })

  it('ignores the retained status from before it asked, and other surveys', () => {
    let s = findReducer(started(), { type: 'status', status: status({ state: 'done', moved_spots: 12, updated_at: '2026-11-16T08:00:00Z' }) })
    expect(s.phase.kind).toBe('sending')
    s = findReducer(s, { type: 'status', status: status({ survey_id: 'sv-2' }) })
    expect(s.phase.kind).toBe('sending')
  })

  it('shows the robot\'s stage and progress, then its count', () => {
    let s = findReducer(started(), { type: 'status', status: status({ stage: 'finding what moved', progress: 0.4 }) })
    expect(s.phase).toEqual({ kind: 'running', stage: 'finding what moved', progress: 0.4 })
    s = findReducer(s, outcome('completed'))
    expect(s.phase.kind).toBe('running')
    s = findReducer(s, { type: 'status', status: status({ state: 'done', moved_spots: 7 }) })
    expect(s.phase).toEqual({ kind: 'done', spots: 7 })
  })

  it('ends on an answer that carries the count, or a refusal', () => {
    expect(findReducer(started(), outcome('completed', { result: { moved_spots: 3 } })).phase).toEqual({ kind: 'done', spots: 3 })
    expect(findReducer(started(), outcome('completed', { result: { error: 'no recording' } })).phase).toEqual({ kind: 'failed', error: 'no recording' })
    expect(findReducer(started(), outcome('failed', { failure_reason: 'The cloud rejected the command (HTTP 404): map map-a has no floor 2' })).phase)
      .toEqual({ kind: 'failed', error: 'The cloud rejected the command (HTTP 404): map map-a has no floor 2' })
    // Accepted with no count: the search goes on, and its end comes as a status.
    expect(findReducer(started(), outcome('completed')).phase).toEqual({ kind: 'running', stage: null, progress: null })
  })

  it('says there was no answer only when no status said otherwise', () => {
    expect(findReducer(started(), outcome('unknown')).phase).toEqual({ kind: 'noAnswer' })
    const following = findReducer(started(), { type: 'status', status: status({}) })
    expect(findReducer(following, outcome('unknown')).phase.kind).toBe('running')
  })

  it('fails with the robot\'s reason', () => {
    const s = findReducer(started(), { type: 'status', status: status({ state: 'failed', error: 'the recording was deleted' }) })
    expect(s.phase).toEqual({ kind: 'failed', error: 'the recording was deleted' })
  })
})

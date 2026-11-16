import { bridgeHasSensors } from '@/sensors/lidarMount'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import type { MapJob } from '@/types/mapPipeline'
import type { RobotState } from '@/types'
import type { SurveyState } from '@/types/survey'

/**
 * The map editor's "Find moving things again" (schema 0.0.23, FIND_MOVING):
 * re-run the moving-object search on the survey recording the robot kept,
 * with another sensitivity, and replace the floor's moved list. The search
 * runs on the robot's computer because only it has the recording (2-3 GB).
 *
 * Which survey and which robot: a draft made by a console survey is uploaded
 * by the device (POST /map-surveys), and its survey job's `detail` carries
 * `survey_id` and `robot_id`. A map uploaded by hand has neither, so there is
 * no recording to search and the button says so.
 */

export const DEFAULT_SENSITIVITY = 0.5

export interface SurveySource {
  surveyId: string
  /** The robot whose computer keeps the recording; null when the job does
   * not say. */
  robotId: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** What GET /maps/{id}/floors/{n}/survey says made the floor: its `survey`
 * key ({survey_id, robot_id}), as the backend keeps it in survey.json. Null
 * when the key is missing or names no survey: the floor's survey is unknown. */
export function parseFloorSurvey(raw: unknown): SurveySource | null {
  const survey = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).survey : null) as Record<string, unknown> | null | undefined
  if (!survey || typeof survey !== 'object') return null
  const surveyId = str(survey.survey_id)
  return surveyId ? { surveyId, robotId: str(survey.robot_id) } : null
}

/** The floor's survey: the floor's own record first; the map's jobs only when
 * the backend has no record to give (`floor` undefined: an older backend, or
 * the request failed), since jobs are pruned after 200. A record that names
 * no survey is unknown, not a reason to guess from the jobs. A record with no
 * robot borrows it from the job of the same survey. */
export function resolveSurveySource(floor: SurveySource | null | undefined, jobs: readonly MapJob[], floorIndex: number): SurveySource | null {
  const fromJobs = surveySource(jobs, floorIndex)
  if (floor === undefined) return fromJobs
  if (!floor) return null
  if (floor.robotId) return floor
  return { ...floor, robotId: fromJobs?.surveyId === floor.surveyId ? fromJobs.robotId : null }
}

/** The survey this floor was made from, from the map's jobs: the newest
 * succeeded survey job for the floor that names a survey_id. */
export function surveySource(jobs: readonly MapJob[], floorIndex: number): SurveySource | null {
  const surveys = jobs
    .filter((j) => j.kind === 'survey' && j.status === 'succeeded' && str(j.detail?.survey_id))
    .filter((j) => {
      const floor = j.detail?.floor
      return floor === undefined || floor === null || Number(floor) === floorIndex
    })
    .sort((a, b) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at))
  const job = surveys[0]
  if (!job) return null
  return { surveyId: str(job.detail?.survey_id)!, robotId: str(job.detail?.robot_id) ?? str(job.requested_by) }
}

export type FindMovingBlock =
  | { reason: 'loading' }
  | { reason: 'noSurvey' }
  | { reason: 'noRobot' }
  | { reason: 'robotGone'; robot: string }
  | { reason: 'oldBridge'; robot: string }
  | { reason: 'offline'; robot: string }
  | { reason: 'unsaved' }
  | { reason: 'busy' }

/** Whether the button can be pressed, and if not, why, in that order: what is
 * missing for good first, then what passes (unsaved changes, a save running). */
export function findMovingBlock(args: {
  source: SurveySource | null | 'loading'
  robots: readonly Pick<RobotState, 'robot_id' | 'name' | 'connectivity' | 'bridge'>[]
  dirty: boolean
  busy: boolean
}): FindMovingBlock | null {
  const { source, robots } = args
  if (source === 'loading') return { reason: 'loading' }
  if (!source) return { reason: 'noSurvey' }
  if (!source.robotId) return { reason: 'noRobot' }
  const robot = robots.find((r) => r.robot_id === source.robotId)
  if (!robot) return { reason: 'robotGone', robot: source.robotId }
  if (!bridgeHasSensors(robot.bridge?.schema_version)) return { reason: 'oldBridge', robot: robot.name }
  if (robot.connectivity.bridge_state !== 'connected') return { reason: 'offline', robot: robot.name }
  if (args.dirty) return { reason: 'unsaved' }
  if (args.busy) return { reason: 'busy' }
  return null
}

// --- progress -----------------------------------------------------------------

export type FindPhase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  /** The robot is searching: `stage` in its own plain words, `progress` 0..1. */
  | { kind: 'running'; stage: string | null; progress: number | null }
  | { kind: 'done'; spots: number | null }
  | { kind: 'failed'; error: string }
  /** The command was never answered in time and no status said otherwise. */
  | { kind: 'noAnswer' }

export interface FindState {
  phase: FindPhase
  surveyId: string | null
  startedAt: number
  /** A survey status for our survey arrived after we started: the robot
   * reports this search there, so its end is what ends it, not the ack. */
  followingStatus: boolean
}

export const IDLE_FIND: FindState = { phase: { kind: 'idle' }, surveyId: null, startedAt: 0, followingStatus: false }

/** The part of SurveyStatus this reads (types/survey.ts). */
export interface FindStatus {
  state: SurveyState
  survey_id?: string | null
  stage?: string | null
  progress?: number | null
  moved_spots?: number | null
  error?: string | null
  updated_at: string
}

export type FindAction =
  | { type: 'start'; surveyId: string; at: number }
  /** A survey status from the robot. */
  | { type: 'status'; status: FindStatus }
  /** FIND_MOVING reached a terminal stage. `statusSource`: the console can
   * hear the robot's survey status at all. */
  | { type: 'outcome'; outcome: Pick<CommandOutcome, 'result'> & { command: { failure_reason?: string; result?: Record<string, unknown> } }; statusSource: boolean }
  | { type: 'reset' }

const RUNNING_STATES = new Set<SurveyState>(['saving', 'processing', 'uploading'])
const active = (p: FindPhase) => p.kind === 'sending' || p.kind === 'running'

export function findReducer(state: FindState, action: FindAction): FindState {
  switch (action.type) {
    case 'reset':
      return IDLE_FIND
    case 'start':
      return { phase: { kind: 'sending' }, surveyId: action.surveyId, startedAt: action.at, followingStatus: false }
    case 'status': {
      const s = action.status
      if (!active(state.phase) || !state.surveyId || s.survey_id !== state.surveyId) return state
      const at = Date.parse(s.updated_at)
      // The retained status may be the survey's own end, from before we asked.
      if (!state.followingStatus && (Number.isNaN(at) || at < state.startedAt)) return state
      if (RUNNING_STATES.has(s.state)) {
        return { ...state, followingStatus: true, phase: { kind: 'running', stage: s.stage ?? null, progress: s.progress ?? null } }
      }
      if (s.state === 'done') return { ...state, followingStatus: true, phase: { kind: 'done', spots: s.moved_spots ?? null } }
      if (s.state === 'failed') return { ...state, followingStatus: true, phase: { kind: 'failed', error: s.error ?? '' } }
      return state
    }
    case 'outcome': {
      if (!active(state.phase)) return state
      const { outcome } = action
      const result = outcome.command.result
      if (outcome.result === 'completed') {
        if (typeof result?.error === 'string' && result.error) return { ...state, phase: { kind: 'failed', error: result.error } }
        if (typeof result?.moved_spots === 'number') return { ...state, phase: { kind: 'done', spots: result.moved_spots } }
        // Accepted, and the search goes on: its end comes as a survey status.
        if (state.followingStatus || action.statusSource) {
          return state.phase.kind === 'running' ? state : { ...state, phase: { kind: 'running', stage: null, progress: null } }
        }
        return { ...state, phase: { kind: 'done', spots: null } }
      }
      if (outcome.result === 'unknown') return state.followingStatus ? state : { ...state, phase: { kind: 'noAnswer' } }
      // Verbatim: the robot's and the backend's own words.
      return { ...state, phase: { kind: 'failed', error: outcome.command.failure_reason ?? outcome.result } }
    }
  }
}

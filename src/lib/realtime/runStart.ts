import type { MissionLibraryEntry } from '@/types'
import type { Step } from '@/missions/program/types'
import { apiErrorFrom } from './apiError'

/** What starting a run on the edge needs (POST /robots/{id}/runs). `started_by`
 * is not here: both providers fill it in with OPERATOR_ID. */
export interface StartRunRequest {
  mission: MissionLibraryEntry
  steps: Step[]
  source: 'editor' | 'run_now'
  /** The task's running-time cap. Paused time does not count against it. */
  maxDurationS?: number
}

/**
 * The backend, or the mock, declined to start a run: the robot is offline, in
 * E-Stop, already running one, someone holds control, and so on.
 *
 * Kept apart from ApiError because the caller's job differs. A refusal's
 * `message` is the backend's `detail`, a sentence written for the operator, and
 * the page shows it as it is and keeps it in view. Any other failure is a fault
 * in the path, worth reporting but not worth reading out.
 *
 * In its own module so both providers can raise it: mockDataProvider cannot
 * import realDataProvider, which already imports it.
 */
export class RunStartRefused extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'RunStartRefused'
  }
}

/** The error for a failed start. 409 and 503 are what the backend's refusals
 * use; any other 4xx (404 for an unknown task or mission, 422 for a body it
 * could not read) is equally "this run will not start", so it is a refusal too.
 * A 5xx other than 503 stays an ApiError. */
export async function runStartError(response: Pick<Response, 'status' | 'json'>, what: string): Promise<Error> {
  const e = await apiErrorFrom(response, what)
  const refused = (response.status >= 400 && response.status < 500) || response.status === 503
  return refused ? new RunStartRefused(e.detail ?? e.message, response.status) : e
}

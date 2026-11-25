import type { MissionLibraryEntry } from '@/types'
import type { Step } from '@/missions/program/types'
import i18n from '@/i18n'
import { fetchUserNames } from '@/lib/auth/userNamesApi'
import { controlHolderName } from '@/liveops/controlOwner'
import { apiErrorFrom } from './apiError'
import { currentOperatorId } from './operator'

/** What starting a run on the edge needs (POST /robots/{id}/runs). `started_by`
 * is not here: both providers fill it in with currentOperatorId(). */
export interface StartRunRequest {
  mission: MissionLibraryEntry
  /** A program's compiled steps. Omitted or empty for a route: the backend
   * compiles a route itself when the run starts (schema 0.0.16). */
  steps?: Step[]
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

/** Statuses whose `detail` is a sentence for the operator: 409 and 503 are the
 * dispatcher's refusals, 404 an unknown task or mission. A 422 is not among
 * them: it can only mean the browser and backend disagree about the schema or
 * the compiled steps, and its detail is a list of field errors, not a sentence. */
const REFUSAL_STATUSES = new Set([404, 409, 503])

/** The error for a failed start: a RunStartRefused for a refusal, else ApiError. */
export async function runStartError(response: Pick<Response, 'status' | 'json'>, what: string): Promise<Error> {
  const e = await apiErrorFrom(response, what)
  if (!REFUSAL_STATUSES.has(response.status)) return e
  const detail = e.detail ?? e.message
  const held = CONTROL_HELD.exec(detail)
  return new RunStartRefused(held ? await controlHeldSentenceNamed(held[1]) : detail, response.status)
}

/** The dispatcher's "<holder> has control of <robot>; release control first"
 * (runs/dispatch.py), whose holder is an id. */
const CONTROL_HELD = /^(\S+) has control of \S+; release control first$/

/**
 * Who holds control, in words: "you", "a mission", or the person's name
 * (else their id). The mock refuses with this directly.
 */
export function controlHeldSentence(holder: string, owner: string = controlHolderName(holder)): string {
  if (holder === currentOperatorId()) return i18n.t('command.refusal.controlHeldByYou')
  return i18n.t('command.refusal.controlHeldBy', { owner })
}

/** controlHeldSentence, asking for a name the page does not have yet: a
 * refusal is read once and not re-rendered when the name arrives. If the ask
 * fails the id stands in. */
async function controlHeldSentenceNamed(holder: string): Promise<string> {
  let owner = controlHolderName(holder)
  if (owner === holder && holder !== currentOperatorId()) {
    try {
      owner = (await fetchUserNames([holder]))[holder] ?? holder
    } catch {
      /* the id stands in for the name */
    }
  }
  return controlHeldSentence(holder, owner)
}

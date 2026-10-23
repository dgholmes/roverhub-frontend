/**
 * A failed call to the backend, with what the backend said.
 *
 * Most failures here are just "it answered 500". A 409 is different: it is an
 * answer a component has to act on, and the two kinds look alike on the wire.
 *
 *   - A stale write (PUT /missions/{id}, PUT /tasks/{id}) answers 409 with the
 *     *stored entity* as the body, so the console can show what changed
 *     (spec §6.2).
 *   - A refused action (POST /tasks/{id}/run-now on a paused task) answers 409
 *     with `{ detail }`: nothing is wrong with what the operator holds.
 *
 * Throwing a bare `Error("... answered 409")` threw both away, so a component
 * could not tell them apart. Both providers raise this, with the same fields,
 * so a component never has to know which one it is talking to.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The parsed JSON body, or null when there was none or it was not JSON. */
    readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** The server's one-sentence `detail`, when it sent one. A structured 422
   * detail (a list of field errors) is not a sentence and is not returned. */
  get detail(): string | null {
    const d = (this.body as { detail?: unknown } | null)?.detail
    return typeof d === 'string' && d.trim() ? d : null
  }
}

/** Build the error for a non-ok response. `what` is the request, e.g. `PUT /tasks`. */
export async function apiErrorFrom(response: Pick<Response, 'status' | 'json'>, what: string): Promise<ApiError> {
  let body: unknown = null
  try { body = await response.json() } catch { /* no body, or not JSON */ }
  const e = new ApiError(response.status, body, `${what} answered ${response.status}`)
  return e.detail ? new ApiError(response.status, body, `${e.message}: ${e.detail}`) : e
}

export type Conflict =
  /** Someone else wrote first. `stored` is the entity as the server now has it. */
  | { kind: 'stale'; stored: unknown }
  /** The server declined the action; nothing the operator holds is out of date. */
  | { kind: 'refused'; detail: string | null }

/** What a 409 means, or null when `e` is not one. */
export function conflictOf(e: unknown): Conflict | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null
  const body = e.body as { version?: unknown } | null
  if (body && typeof body === 'object' && typeof body.version === 'number') return { kind: 'stale', stored: e.body }
  return { kind: 'refused', detail: e.detail }
}

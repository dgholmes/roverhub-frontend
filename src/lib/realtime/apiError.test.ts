import { describe, expect, it } from 'vitest'
import { ApiError, apiErrorFrom, conflictOf } from './apiError'

const response = (status: number, body: unknown, jsonThrows = false) => ({
  status, json: () => (jsonThrows ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(body)),
})

describe('apiErrorFrom', () => {
  it('carries the status and the parsed body, and names the request in its message', async () => {
    const stored = { task_id: 't1', version: 5 }
    const e = await apiErrorFrom(response(409, stored), 'PUT /tasks')
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(409)
    expect(e.body).toEqual(stored)
    expect(e.message).toBe('PUT /tasks answered 409')
  })

  it("puts the server's detail in the message when it sent one", async () => {
    const e = await apiErrorFrom(response(409, { detail: 'task is paused; only an enabled task can be run' }), 'POST /tasks/t1/run-now')
    expect(e.detail).toBe('task is paused; only an enabled task can be run')
    expect(e.message).toBe('POST /tasks/t1/run-now answered 409: task is paused; only an enabled task can be run')
  })

  it('survives a body that is not JSON', async () => {
    const e = await apiErrorFrom(response(502, null, true), 'GET /tasks')
    expect(e.status).toBe(502)
    expect(e.body).toBeNull()
    expect(e.detail).toBeNull()
  })

  it('does not read a structured 422 detail as a sentence', async () => {
    const e = await apiErrorFrom(response(422, { detail: [{ loc: ['body'], msg: 'bad' }] }), 'PUT /tasks')
    expect(e.detail).toBeNull()
    expect(e.message).toBe('PUT /tasks answered 422')
  })
})

describe('conflictOf', () => {
  it('reads a 409 whose body is an entity as a stale write, handing back the stored one', () => {
    const stored = { task_id: 't1', version: 5 }
    expect(conflictOf(new ApiError(409, stored, 'x'))).toEqual({ kind: 'stale', stored })
  })

  it('reads a 409 with only a detail as a refusal, not a stale write', () => {
    expect(conflictOf(new ApiError(409, { detail: 'task is paused' }, 'x'))).toEqual({ kind: 'refused', detail: 'task is paused' })
  })

  it('is not a conflict for any other status, or for something that is not an ApiError', () => {
    expect(conflictOf(new ApiError(500, { version: 1 }, 'x'))).toBeNull()
    expect(conflictOf(new Error('PUT /tasks answered 409'))).toBeNull()
    expect(conflictOf(null)).toBeNull()
  })

  it('does not take an empty or unreadable 409 body for a stored entity', () => {
    expect(conflictOf(new ApiError(409, null, 'x'))).toEqual({ kind: 'refused', detail: null })
    expect(conflictOf(new ApiError(409, {}, 'x'))).toEqual({ kind: 'refused', detail: null })
  })
})

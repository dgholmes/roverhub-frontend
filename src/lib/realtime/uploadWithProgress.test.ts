import { afterEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/lib/auth/authStore'
import { postFormWithProgress, type XhrLike } from './uploadWithProgress'

class FakeXhr implements XhrLike {
  method = ''
  url = ''
  headers: Record<string, string> = {}
  sent: FormData | null = null
  withCredentials = false
  status = 0
  responseText = ''
  aborted = false
  upload: XhrLike['upload'] = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(name: string, value: string) { this.headers[name] = value }
  send(body: FormData) { this.sent = body }
  abort() { this.aborted = true; this.onabort?.() }
  answer(status: number, body: unknown) { this.status = status; this.responseText = JSON.stringify(body); this.onload?.() }
}

const initial = useAuthStore.getState()
afterEach(() => useAuthStore.setState(initial, true))

describe('postFormWithProgress', () => {
  it('POSTs with cookies and the session token, reports progress, and resolves with the parsed body', async () => {
    useAuthStore.setState({ token: 'tok-1' })
    const xhr = new FakeXhr()
    const seen: number[] = []
    const form = new FormData()
    const pending = postFormWithProgress('http://api/map-surveys', form, { onProgress: (f) => seen.push(f) }, () => xhr)
    expect(xhr.method).toBe('POST')
    expect(xhr.withCredentials).toBe(true)
    expect(xhr.headers.Authorization).toBe('Bearer tok-1')
    expect(xhr.sent).toBe(form)
    xhr.upload.onprogress?.({ loaded: 25, total: 100, lengthComputable: true })
    xhr.upload.onprogress?.({ loaded: 0, total: 0, lengthComputable: false })
    xhr.answer(202, { job_id: 'mjob-1' })
    await expect(pending).resolves.toEqual({ status: 202, body: { job_id: 'mjob-1' } })
    expect(seen).toEqual([0.25])
  })

  it('sends no Authorization header with sign-in off', async () => {
    useAuthStore.setState({ token: null })
    const xhr = new FakeXhr()
    const pending = postFormWithProgress('http://api/x', new FormData(), {}, () => xhr)
    expect(xhr.headers.Authorization).toBeUndefined()
    xhr.answer(400, { detail: 'name is required' })
    expect((await pending).status).toBe(400)
  })

  it('rejects with an AbortError when the signal aborts', async () => {
    const xhr = new FakeXhr()
    const controller = new AbortController()
    const pending = postFormWithProgress('http://api/x', new FormData(), { signal: controller.signal }, () => xhr)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(xhr.aborted).toBe(true)
  })

  it('rejects on a network failure', async () => {
    const xhr = new FakeXhr()
    const pending = postFormWithProgress('http://api/x', new FormData(), {}, () => xhr)
    xhr.onerror?.()
    await expect(pending).rejects.toThrow(/could not reach/)
  })

  it('ends the session on a 401 for the token it sent', async () => {
    let ended: unknown = null
    useAuthStore.setState({ token: 'tok-2', authEnabled: true, endSession: (n?: unknown) => { ended = n ?? 'ended' } } as never)
    const xhr = new FakeXhr()
    const pending = postFormWithProgress('http://api/x', new FormData(), {}, () => xhr)
    xhr.answer(401, { detail: 'sign in to continue' })
    await pending
    expect(ended).toBe('expired')
  })
})

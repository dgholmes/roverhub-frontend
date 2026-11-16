import { useAuthStore } from '@/lib/auth/authStore'

/** What came back: the status and the parsed JSON body (null when none). */
export interface UploadAnswer {
  status: number
  body: unknown
}

/** The parts of XMLHttpRequest used here, so a test can stand one in. */
export interface XhrLike {
  open(method: string, url: string): void
  setRequestHeader(name: string, value: string): void
  send(body: FormData): void
  abort(): void
  withCredentials: boolean
  status: number
  responseText: string
  upload: { onprogress: ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) | null }
  onload: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
}

/**
 * POST a form with upload progress. `fetch` cannot report bytes sent, and a
 * survey's cloud is tens to hundreds of megabytes, so this uses XMLHttpRequest
 * -- with what apiFetch adds (the session's Bearer token, cookies, and ending
 * the session on a 401), since it cannot go through apiFetch.
 *
 * Resolves for every HTTP status, like fetch; rejects on a network failure,
 * and with an AbortError when `signal` aborts.
 */
export function postFormWithProgress(
  url: string,
  form: FormData,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
  makeXhr: () => XhrLike = () => new XMLHttpRequest() as unknown as XhrLike,
): Promise<UploadAnswer> {
  const { onProgress, signal } = options
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The upload was cancelled', 'AbortError'))
      return
    }
    const token = useAuthStore.getState().token
    const xhr = makeXhr()
    xhr.open('POST', url)
    xhr.withCredentials = true
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total))
    }
    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const done = () => signal?.removeEventListener('abort', onAbort)
    xhr.onload = () => {
      done()
      let body: unknown = null
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { /* not JSON */ }
      if (xhr.status === 401) {
        const { authEnabled, token: current } = useAuthStore.getState()
        if (authEnabled && current === token) useAuthStore.getState().endSession('expired')
      }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = () => { done(); reject(new Error('the upload could not reach the server')) }
    xhr.onabort = () => { done(); reject(new DOMException('The upload was cancelled', 'AbortError')) }
    xhr.send(form)
  })
}

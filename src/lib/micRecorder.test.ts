import { describe, expect, it } from 'vitest'
import { micUnavailableReason, problemFromError } from './micRecorder'

const named = (name: string) => Object.assign(new Error(name), { name })

describe('micUnavailableReason', () => {
  const capable = {
    isSecureContext: true,
    navigator: { mediaDevices: { getUserMedia: () => undefined } },
    MediaRecorder: function MediaRecorder() {},
  }

  it('allows a secure context with a recorder', () => {
    expect(micUnavailableReason(capable)).toBeNull()
  })

  it('names plain http from another machine, where mediaDevices is missing', () => {
    // Over http://10.x the browser hides navigator.mediaDevices entirely; the
    // operator needs "open it on localhost or HTTPS", not "unsupported".
    expect(micUnavailableReason({ ...capable, isSecureContext: false, navigator: {} })).toBe('insecure')
  })

  it('reports a browser without MediaRecorder as unsupported', () => {
    expect(micUnavailableReason({ ...capable, MediaRecorder: undefined })).toBe('unsupported')
  })
})

describe('problemFromError', () => {
  it('maps the getUserMedia rejections an operator can act on', () => {
    expect(problemFromError(named('NotAllowedError'))).toBe('denied')
    expect(problemFromError(named('NotFoundError'))).toBe('noDevice')
    expect(problemFromError(named('AbortError'))).toBe('failed')
    expect(problemFromError('nonsense')).toBe('failed')
  })
})

import { useEffect, useState } from 'react'
import { WEBRTC_RETRY_MS, openWebRtcStream, type WebRtcStatus } from '@/lib/webrtcVideo'

/**
 * Keeps a WebRTC session open for one camera while `enabled`, retrying after a
 * failure or a dropped session. See lib/webrtcVideo.ts.
 *
 * `enabled` should already account for page visibility: a hidden tab should not
 * hold a decoder open any more than the MJPEG feed does.
 */
export function useWebRtcVideo(
  baseUrl: string | undefined,
  camera: string,
  enabled: boolean,
): { status: WebRtcStatus; stream: MediaStream | null } {
  const [status, setStatus] = useState<WebRtcStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!baseUrl || !enabled) {
      setStatus('idle')
      setStream(null)
      return
    }
    let cancelled = false
    let close: (() => void) | undefined
    setStatus('connecting')
    openWebRtcStream(baseUrl, camera, () => {
      if (cancelled) return
      setStatus('failed')
      setStream(null)
    })
      .then((session) => {
        if (cancelled) { session.close(); return }
        close = session.close
        setStream(session.stream)
        setStatus('live')
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
      close?.()
    }
  }, [baseUrl, camera, enabled, attempt])

  useEffect(() => {
    if (status !== 'failed') return
    const id = setTimeout(() => setAttempt((n) => n + 1), WEBRTC_RETRY_MS)
    return () => clearTimeout(id)
  }, [status])

  return { status, stream }
}

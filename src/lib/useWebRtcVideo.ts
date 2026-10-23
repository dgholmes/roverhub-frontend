import { useEffect, useRef, useState } from 'react'
import {
  WEBRTC_RETRY_MS, markServesWebRtc, openWebRtcStream, servesWebRtc, type WebRtcStatus,
} from '@/lib/webrtcVideo'

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
): { status: WebRtcStatus; stream: MediaStream | null; servesWebRtc: boolean } {
  const [status, setStatus] = useState<WebRtcStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Whether an attempt for THIS device + camera has failed since it was
  // selected. Reset on a switch, so a new robot starts with a clean slate.
  const failed = useRef(false)
  useEffect(() => { failed.current = false }, [baseUrl, camera])

  useEffect(() => {
    if (!baseUrl || !enabled) {
      setStatus('idle')
      setStream(null)
      return
    }
    let cancelled = false
    let close: (() => void) | undefined
    setStream(null)
    setStatus(failed.current ? 'retrying' : 'connecting')
    openWebRtcStream(baseUrl, camera, () => {
      if (cancelled) return
      failed.current = true
      setStatus('failed')
      setStream(null)
    })
      .then((session) => {
        if (cancelled) { session.close(); return }
        close = session.close
        markServesWebRtc(baseUrl, camera)
        setStream(session.stream)
        setStatus('live')
      })
      .catch(() => {
        if (cancelled) return
        failed.current = true
        setStatus('failed')
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

  return { status, stream, servesWebRtc: servesWebRtc(baseUrl, camera) }
}

import { useEffect, useState } from 'react'

/**
 * A recorded clip played as if it were the robot's live camera, for working on
 * the camera UI without a robot (mock mode only).
 *
 * Set VITE_MOCK_CAMERA_CLIP to a URL the dev server serves (e.g. a file in
 * `public/dev-clips/`, which is gitignored) and every camera pane without an
 * edge device shows it as a MediaStream, exactly where the WebRTC stream would
 * go. Unset, nothing changes. Used to check camera stabilisation against a real
 * recorded walk (2026-11-18, rover-jetson).
 */
export const MOCK_CAMERA_CLIP: string | undefined = import.meta.env.VITE_MOCK_CAMERA_CLIP || undefined

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

export function useMockClipStream(url: string | undefined, enabled: boolean): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null)
  useEffect(() => {
    if (!url || !enabled || typeof document === 'undefined') {
      setStream(null)
      return
    }
    const video = document.createElement('video') as CapturableVideo
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.src = url
    // Kept in the document (but invisible) so the browser keeps decoding it.
    Object.assign(video.style, {
      position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none',
    })
    document.body.appendChild(video)
    const onPlaying = () => {
      const capture = video.captureStream ?? video.mozCaptureStream
      if (capture) setStream(capture.call(video))
    }
    video.addEventListener('playing', onPlaying, { once: true })
    video.play().catch(() => {})
    return () => {
      video.removeEventListener('playing', onPlaying)
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      setStream(null)
    }
  }, [url, enabled])
  return stream
}

import { useEffect, useState } from 'react'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTranslation } from 'react-i18next'
import { Loader2, VideoOff } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { edgeVideoBaseUrlFor } from '@/lib/edgeVideo'
import { useWebRtcVideo } from '@/lib/useWebRtcVideo'
import { choosePlayback } from '@/lib/webrtcVideo'
import { StreamVideo } from './StreamVideo'
import {
  STREAM_RECYCLE_INTERVAL_MS, recycleGeneration, shouldConnectStream, streamKey,
} from '@/lib/videoStream'
import type { CameraFit } from '@/store/useSessionStore'
import type { RobotState } from '@/types'


/**
 * The live camera image plane — usable as either the hero background or,
 * scaled down, the mini inset. Distinguishes connected / reconnecting /
 * unavailable rather than a connected-vs-not binary (LVO-015 requires
 * reconnecting and permission-denied as distinct feed states (there is no
 * audio: every feed renders muted, so no mute state either) —
 * permission-denied is intentionally not modeled here: this is an <img> on an
 * MJPEG relay (or a static placeholder), never getUserMedia/WebRTC, so there's
 * no genuine browser permission concept to attach it to honestly).
 *
 * If DDS is unavailable or reconnecting the feed does not go blank; it
 * keeps the last frame with an overlay (docs/05-ui-ux.md §8, §14).
 *
 * When VITE_EDGE_VIDEO_BASE_URL is configured and DDS is connected, renders
 * the real MJPEG relay (a plain <img> pointed at a multipart/x-mixed-replace
 * stream renders as live video in every major browser, no video/canvas
 * element needed) instead of the static placeholder — falling back to the
 * placeholder on a load error (edge device unreachable) via onError, so a
 * misconfigured or offline video URL never shows a broken-image icon.
 */
function CameraFeedPane(
  { robot, facing = 'front', fit = 'fit' }:
  { robot: RobotState; facing?: CameraFacing; fit?: CameraFit },
) {
  const { t } = useTranslation()
  const dds = robot.connectivity.dds
  const ddsAvailable = dds === 'connected'
  const [videoErrored, setVideoErrored] = useState(false)
  // Resolved per robot: the MJPEG relay runs on whichever edge device is next to
  // THIS robot, so a single global URL would show one robot's camera while
  // another is selected (see lib/edgeVideo.ts).
  const videoBaseUrl = edgeVideoBaseUrlFor(robot.robot_id)
  const realVideoUrl = videoBaseUrl ? `${videoBaseUrl}/video/${facing}` : undefined

  // --- MJPEG memory management -------------------------------------------
  // Chrome accumulates decoded-frame memory for the life of an <img> bound to
  // a multipart/x-mixed-replace stream, and does not release it when the
  // stream stops. Measured on a real session: a 945 MB tab footprint against a
  // normal 92 MB JS heap, with the network already idle -- which ends in "Aw,
  // Snap! Out of Memory" after a few hours. The rules live in lib/videoStream
  // so they are testable; this component only applies them. See that file.

  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  useEffect(() => {
    const onChange = () => setDocumentVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // The robot's own H.264 stream over WebRTC, when the edge device offers it
  // (VIDEO_SOURCE=rtsp). Not gated on DDS: that stream does not travel over it.
  // Until it is live -- or on a bridge still serving MJPEG -- the <img> below
  // is used exactly as before. See lib/webrtcVideo.ts.
  const webrtc = useWebRtcVideo(videoBaseUrl, facing, documentVisible)

  const mjpegAllowed = shouldConnectStream({
    documentVisible,
    hasUrl: realVideoUrl != null,
    ddsAvailable,
    errored: videoErrored,
  })
  const playback = choosePlayback(webrtc.status, mjpegAllowed, webrtc.servesWebRtc)
  const showRealVideo = playback === 'mjpeg'
  // The <video> stays transparent until its first frame plays; until then the
  // spinner covers both 'pending' and that last fraction of a second.
  const [videoPlaying, setVideoPlaying] = useState(false)
  const connecting = playback === 'pending' || (playback === 'webrtc' && !videoPlaying)
  // DDS overlays describe the MJPEG relay's source; they would be false over a
  // WebRTC picture that is still arriving.
  const ddsOverlays = playback !== 'webrtc'

  // Advances on a timer; feeding it into the element's key is what actually
  // destroys the old <img> and frees what it was holding.
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    // Only while connected: a hidden or placeholder feed has no element worth
    // recycling, and ticking anyway would blink the feed the moment it returns.
    if (!showRealVideo) return
    const started = Date.now()
    const id = setInterval(
      () => setGeneration(recycleGeneration(Date.now() - started)),
      STREAM_RECYCLE_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [showRealVideo, realVideoUrl])

  // A fresh connection attempt should get a fresh chance on facing/URL
  // change, rather than staying stuck on a stale error from a previous camera.
  useEffect(() => {
    setVideoErrored(false)
  }, [realVideoUrl])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: color.videoBg }}>
      {playback === 'webrtc' && webrtc.stream ? (
        <StreamVideo
          stream={webrtc.stream}
          onPlaying={setVideoPlaying}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: fit === 'fill' ? 'cover' : 'contain', objectPosition: 'center', display: 'block',
          }}
        />
      ) : playback === 'pending' ? null : (
      <img
        key={streamKey(realVideoUrl, generation, showRealVideo)}
        src={showRealVideo ? realVideoUrl : './live_view.png'}
        alt=""
        onError={() => { if (showRealVideo) setVideoErrored(true) }}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          // The real feed is 4:3 (640x480, fixed by the robot -- it publishes
          // pre-compressed JPEG and the SDK exposes no resolution control) while
          // this pane is wide, so 'cover' silently cropped away the top and
          // bottom of every frame. On a teleop view that is lost field of view
          // exactly where it matters: the ground ahead, obstacles, and the
          // robot's own feet. 'contain' shows the whole frame and pillarboxes
          // against the dark plate behind it.
          //
          // A blurred backdrop copy would look nicer than bars, but it needs a
          // second <img> on the same URL -- and a second <img> is a second HTTP
          // connection to the relay, i.e. double the video bandwidth on the link
          // we are trying to conserve. Not worth it.
          //
          // The placeholder keeps 'cover': it is decorative artwork sized for a
          // wide pane, so cropping it costs nothing.
          //
          // Operator-switchable via the Fit/Fill control in CameraModeTabs;
          // 'fit' (no crop) is the default.
          objectFit: showRealVideo ? (fit === 'fill' ? 'cover' : 'contain') : 'cover',
          objectPosition: 'center', display: 'block',
          filter: ddsAvailable ? undefined : 'grayscale(0.6) brightness(0.5)',
        }}
      />
      )}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0.6) 3px)',
      }} />

      {connecting && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space[2], pointerEvents: 'none',
        }}>
          <Loader2 size={22} color={color.t2} strokeWidth={1.5} className="rh-spin" />
          <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('liveops.camera.connecting')}</span>
        </div>
      )}

      {ddsOverlays && !connecting && dds === 'reconnecting' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space[2],
          background: 'rgba(8,8,10,0.45)', textAlign: 'center', padding: space[4],
        }}>
          <Loader2 size={22} color={color.amber} strokeWidth={1.5} className="rh-spin" />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
            {t('liveops.camera.reconnectingDds')}
          </span>
          <span style={{ fontSize: font.size.xs, color: color.t3 }}>{t('liveops.camera.lastFrame')}</span>
        </div>
      )}

      {ddsOverlays && !connecting && dds === 'unavailable' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space[2],
          background: 'rgba(8,8,10,0.55)', textAlign: 'center', padding: space[4],
        }}>
          <VideoOff size={22} color={color.t2} strokeWidth={1.5} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
            {t('liveops.camera.feedPaused')}
          </span>
          <span style={{ fontSize: font.size.xs, color: color.t3 }}>{t('liveops.camera.lastFrame')}</span>
        </div>
      )}
    </div>
  )
}

/** A camera pane behind its own error boundary, so a fault in one feed leaves
 * the other panes and the command bar alone. */
export function CameraFeedLayer(props: React.ComponentProps<typeof CameraFeedPane>) {
  return (
    <ErrorBoundary area={`camera (${props.facing ?? 'front'})`} variant="pane" resetKeys={[props.robot.robot_id, props.facing]}>
      <CameraFeedPane {...props} />
    </ErrorBoundary>
  )
}

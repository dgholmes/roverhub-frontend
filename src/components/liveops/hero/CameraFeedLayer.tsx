import { useEffect, useState } from 'react'
import { Loader2, VideoOff, VolumeX } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { edgeVideoBaseUrlFor } from '@/lib/edgeVideo'
import {
  STREAM_RECYCLE_INTERVAL_MS, recycleGeneration, shouldConnectStream, streamKey,
} from '@/lib/videoStream'
import type { CameraFit } from '@/store/useSessionStore'
import type { RobotState } from '@/types'


/**
 * The live camera image plane — usable as either the hero background or,
 * scaled down, the mini inset. Distinguishes connected / reconnecting /
 * unavailable rather than a connected-vs-not binary (LVO-015 requires
 * reconnecting, muted, and permission-denied as distinct feed states —
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
export function CameraFeedLayer(
  { robot, muted, facing = 'front', fit = 'fit' }:
  { robot: RobotState; muted?: boolean; facing?: CameraFacing; fit?: CameraFit },
) {
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

  const showRealVideo = shouldConnectStream({
    documentVisible,
    hasUrl: realVideoUrl != null,
    ddsAvailable,
    errored: videoErrored,
  })

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
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0B0E12' }}>
      <img
        key={streamKey(realVideoUrl, generation, showRealVideo)}
        src={showRealVideo ? realVideoUrl : '/live_view.png'}
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
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0.6) 3px)',
      }} />

      {dds === 'reconnecting' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space[2],
          background: 'rgba(8,8,10,0.45)', textAlign: 'center', padding: space[4],
        }}>
          <Loader2 size={22} color={color.amber} strokeWidth={1.5} className="rh-spin" />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
            Reconnecting to DDS…
          </span>
          <span style={{ fontSize: font.size.xs, color: color.t3 }}>Showing last received frame</span>
        </div>
      )}

      {dds === 'unavailable' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space[2],
          background: 'rgba(8,8,10,0.55)', textAlign: 'center', padding: space[4],
        }}>
          <VideoOff size={22} color={color.t2} strokeWidth={1.5} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
            Feed paused — DDS connection lost
          </span>
          <span style={{ fontSize: font.size.xs, color: color.t3 }}>Showing last received frame</span>
        </div>
      )}

      {muted && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 900,
          ...glass.overlay, borderRadius: radius.sm, padding: '4px 8px',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <VolumeX size={12} color={color.t2} strokeWidth={1.8} />
          <span style={{ fontSize: font.size.xs, color: color.t2 }}>Muted</span>
        </div>
      )}
    </div>
  )
}

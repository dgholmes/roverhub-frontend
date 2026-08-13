import { useEffect, useState } from 'react'
import { Loader2, VideoOff, VolumeX } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { edgeVideoBaseUrlFor } from '@/lib/edgeVideo'
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
  const showRealVideo = realVideoUrl != null && ddsAvailable && !videoErrored

  // A fresh connection attempt should get a fresh chance on facing/URL
  // change, rather than staying stuck on a stale error from a previous camera.
  useEffect(() => {
    setVideoErrored(false)
  }, [realVideoUrl])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0B0E12' }}>
      <img
        key={showRealVideo ? realVideoUrl : 'placeholder'}
        src={showRealVideo ? realVideoUrl : '/live_view.png'}
        // Was alt="", marking the app's primary operational content as
        // decorative. The frame contents cannot be described, but *what this
        // is* can be, and that is what a name is for — the alternative left a
        // screen-reader user with no indication the view existed at all.
        // The paused case says so, rather than naming a feed that isn't live.
        // docs/audit/2026-08-12-ui-ux-audit.md A-58.
        alt={showRealVideo
          ? `Live ${facing} camera — ${robot.name}`
          : `${facing} camera — no live feed`}
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

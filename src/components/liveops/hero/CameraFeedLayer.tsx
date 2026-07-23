import { useEffect, useState } from 'react'
import { Loader2, VideoOff, VolumeX } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import type { RobotState } from '@/types'

/** Base URL of stream_manager.py's MJPEG relay (e.g.
 * "http://10.0.12.65:8090"), serving GET /video/{front,back} -- see
 * roverhub-edge/robot_bridge/stream_manager.py and docs/09-low-level-sdk.md.
 * Unset in mock mode and on any deployment without a low-level-enabled edge
 * bridge; the static placeholder is used instead. This is a direct
 * browser-to-edge-device HTTP connection (same-LAN dev/test setup only, not
 * the production WebRTC/MediaMTX path). */
const EDGE_VIDEO_BASE_URL = import.meta.env.VITE_EDGE_VIDEO_BASE_URL as string | undefined

/**
 * The live camera image plane — usable as either the hero background or,
 * scaled down, the mini inset. Distinguishes connected / reconnecting /
 * unavailable rather than a connected-vs-not binary (LVO-015 requires
 * reconnecting, muted, and permission-denied as distinct feed states —
 * permission-denied is intentionally not modeled here: this feed is a
 * static mock image, not real getUserMedia/WebRTC, so there's no genuine
 * browser permission concept to attach it to honestly).
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
export function CameraFeedLayer({ robot, muted, facing = 'front' }: { robot: RobotState; muted?: boolean; facing?: CameraFacing }) {
  const dds = robot.connectivity.dds
  const ddsAvailable = dds === 'connected'
  const [videoErrored, setVideoErrored] = useState(false)
  const realVideoUrl = EDGE_VIDEO_BASE_URL ? `${EDGE_VIDEO_BASE_URL}/video/${facing}` : undefined
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
        alt=""
        onError={() => { if (showRealVideo) setVideoErrored(true) }}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center', display: 'block',
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

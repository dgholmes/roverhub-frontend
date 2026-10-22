import { useEffect, useState } from 'react'
import { VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font } from '@/design-system/tokens'
import { edgeVideoBaseUrlFor } from '@/lib/edgeVideo'
import { useWebRtcVideo } from '@/lib/useWebRtcVideo'
import { choosePlayback } from '@/lib/webrtcVideo'
import { StreamVideo } from './StreamVideo'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import type { RobotState } from '@/types'

/**
 * Small camera view for the map inset and the Cockpit picture-in-picture.
 *
 * Both of these previously hardcoded `./live_view.png` — a stock photograph —
 * with no connection gating and no marker saying it was not live. In Cockpit
 * mode that PiP is the *only* camera surface, so an operator flying the robot
 * from the map was looking at a photograph of a robot while believing it was
 * the feed. Shows the real relay when it is available and says so plainly when
 * it is not. docs/audit/2026-08-12-ui-ux-audit.md A-15.
 */
export function CameraThumb({
  robot, facing = 'front', width, height,
}: {
  robot: RobotState
  facing?: CameraFacing
  width: number
  height: number
}) {
  const { t } = useTranslation()
  const [errored, setErrored] = useState(false)
  const baseUrl = edgeVideoBaseUrlFor(robot.robot_id)
  const url = baseUrl ? `${baseUrl}/video/${facing}` : undefined
  // WebRTC when the edge device offers it, else the MJPEG relay (which needs
  // DDS). See lib/webrtcVideo.ts.
  const webrtc = useWebRtcVideo(baseUrl, facing, true)
  const playback = choosePlayback(
    webrtc.status, url != null && robot.connectivity.dds === 'connected' && !errored,
  )
  const alt = t(facing === 'back' ? 'liveops.camera.liveAltBack' : 'liveops.camera.liveAltFront', { name: robot.name })

  // A new camera or robot deserves a fresh attempt rather than inheriting the
  // previous one's error.
  useEffect(() => { setErrored(false) }, [url])

  if (playback === 'webrtc' && webrtc.stream) {
    return (
      <StreamVideo
        stream={webrtc.stream}
        ariaLabel={alt}
        style={{ width, height, objectFit: 'cover', display: 'block' }}
      />
    )
  }

  if (playback === 'none') {
    return (
      <div
        role="img"
        aria-label={t('liveops.camera.unavailableAria')}
        style={{
          width, height, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4,
          background: color.elevated, color: color.t2, fontFamily: font.family,
        }}
      >
        <VideoOff size={16} strokeWidth={1.8} />
        <span style={{ fontSize: font.size.sm }}>{t('liveops.camera.noFeed')}</span>
      </div>
    )
  }

  return (
    <img
      key={url}
      src={url}
      alt={alt}
      onError={() => setErrored(true)}
      style={{ width, height, objectFit: 'cover', display: 'block' }}
    />
  )
}

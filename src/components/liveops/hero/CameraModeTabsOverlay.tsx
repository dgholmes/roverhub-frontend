import { CameraModeTabs, type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import type { CameraFit } from '@/store/useSessionStore'

/**
 * Floats the camera controls (RGB with its Front/Rear toggle, Depth, fit) in
 * the camera pane's top-right corner — top-left belongs to telemetry, so the
 * two never compete for the same space.
 *
 * There is no mute button. It used to live here, but every feed renders
 * muted (StreamVideo's <video muted>; MJPEG has no audio), so it only toggled
 * a "Muted" chip. Removed 2026-11-06.
 */
export function CameraModeTabsOverlay({
  mode, onChange, ddsAvailable, facing, onFacingChange, fit, onFitChange,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
  facing: CameraFacing
  onFacingChange: (f: CameraFacing) => void
  fit: CameraFit
  onFitChange: (f: CameraFit) => void
}) {
  return (
    <div className="rh-on-video rh-video-bar" style={{ position: 'absolute', top: 12, right: 12, zIndex: 900 }}>
      <CameraModeTabs
        mode={mode} onChange={onChange} ddsAvailable={ddsAvailable}
        facing={facing} onFacingChange={onFacingChange}
        fit={fit} onFitChange={onFitChange}
      />
    </div>
  )
}

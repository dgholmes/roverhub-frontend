import { Volume2, VolumeX } from 'lucide-react'
import { IconButton } from '@/components/kit'
import { CameraModeTabs, type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import type { CameraFit } from '@/store/useSessionStore'

/**
 * Floats the camera controls (RGB/Depth/Thermal, facing, fit, mute) in the
 * camera pane's top-right corner — top-left belongs to telemetry, so the two
 * never compete for the same space.
 *
 * Also carries the feed mute toggle. That used to live in MediaControlsOverlay
 * alongside Record/Mic/More — which had no onClick at all — and a Snapshot
 * button duplicating the command bar's. Mute was the only control there doing
 * real work (it drives CameraFeedLayer's `muted`), so the bar was removed and
 * mute moved here, with the other feed controls.
 */
export function CameraModeTabsOverlay({
  mode, onChange, ddsAvailable, facing, onFacingChange, fit, onFitChange, muted, onToggleMute,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
  facing: CameraFacing
  onFacingChange: (f: CameraFacing) => void
  fit: CameraFit
  onFitChange: (f: CameraFit) => void
  muted: boolean
  onToggleMute: () => void
}) {
  return (
    <div className="rh-on-video rh-video-bar" style={{ position: 'absolute', top: 12, right: 12, zIndex: 900 }}>
      <CameraModeTabs
        mode={mode} onChange={onChange} ddsAvailable={ddsAvailable}
        facing={facing} onFacingChange={onFacingChange}
        fit={fit} onFitChange={onFitChange}
      />
      <IconButton
        size="sm"
        icon={muted ? VolumeX : Volume2}
        label={muted ? 'Unmute feed audio' : 'Mute feed audio'}
        onClick={onToggleMute}
        style={muted ? { color: '#ffd60a' } : undefined}
      />
    </div>
  )
}

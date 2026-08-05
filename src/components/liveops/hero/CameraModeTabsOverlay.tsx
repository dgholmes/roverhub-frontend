import { Volume2, VolumeX } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { CameraModeTabs, type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'

/**
 * Floats the RGB/Depth/Thermal switcher directly on the live view/map,
 * matching the other floating HUD elements (telemetry, REC) instead of sitting
 * in the fixed header bar.
 *
 * Also carries the feed mute toggle. That used to live in MediaControlsOverlay
 * alongside Record/Mic/More — which had no onClick at all — and a Snapshot
 * button duplicating the command bar's. Mute was the only control there doing
 * real work (it drives CameraFeedLayer's `muted`), so the bar was removed and
 * mute moved here, with the other feed controls.
 */
export function CameraModeTabsOverlay({
  mode, onChange, ddsAvailable, facing, onFacingChange, muted, onToggleMute,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
  facing: CameraFacing
  onFacingChange: (f: CameraFacing) => void
  muted: boolean
  onToggleMute: () => void
}) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
      ...glass.overlay, borderRadius: radius.md, padding: `${space[1]}px ${space[2]}px`,
      display: 'flex', alignItems: 'center', gap: space[2],
    }}>
      <CameraModeTabs mode={mode} onChange={onChange} ddsAvailable={ddsAvailable} facing={facing} onFacingChange={onFacingChange} />
      <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)' }} />
      <button
        onClick={onToggleMute}
        title={muted ? 'Unmute feed audio' : 'Mute feed audio'}
        aria-label={muted ? 'Unmute feed audio' : 'Mute feed audio'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: radius.sm,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: muted ? color.amber : color.t2, fontFamily: font.family,
        }}
      >
        {muted ? <VolumeX size={14} strokeWidth={1.8} /> : <Volume2 size={14} strokeWidth={1.8} />}
      </button>
    </div>
  )
}

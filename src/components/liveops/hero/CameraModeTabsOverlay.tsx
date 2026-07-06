import { glass, radius, space } from '@/design-system/tokens'
import { CameraModeTabs, type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'

/**
 * Floats the RGB/Depth/Thermal switcher directly on the live view/map,
 * matching the other floating HUD elements (telemetry, REC, media controls)
 * instead of sitting in the fixed header bar.
 */
export function CameraModeTabsOverlay({
  mode, onChange, ddsAvailable, facing, onFacingChange,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
  facing: CameraFacing
  onFacingChange: (f: CameraFacing) => void
}) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
      ...glass.overlay, borderRadius: radius.md, padding: `${space[1]}px ${space[2]}px`,
    }}>
      <CameraModeTabs mode={mode} onChange={onChange} ddsAvailable={ddsAvailable} facing={facing} onFacingChange={onFacingChange} />
    </div>
  )
}

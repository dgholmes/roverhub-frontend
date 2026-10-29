import { useState } from 'react'
import { color } from '@/design-system/tokens'
import { type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { TelemetryStrip } from '@/components/liveops/feed/TelemetryPanel'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CaptureRail } from './CaptureRail'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { HeroInset } from './HeroInset'
import { ManualControlOverlay } from './ManualControlOverlay'
import { QuickActionsMenu } from '@/components/liveops/command/QuickActionsMenu'
import type { Mission, RobotState } from '@/types'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * Camera-first LiveOps view — Cockpit, the default view mode
 * (docs/05-ui-ux.md §4). It replaced the earlier map-led Cockpit, whose only
 * unique content (battery time left, device details link) moved into the
 * telemetry strip and the connection popover. The camera fills the pane; telemetry sits in one
 * instrument strip docked above it rather than as chips floating over the
 * footage; the map is a large inset that swaps with the camera.
 *
 * Docking the strip costs the video 44px of height and buys an unobstructed
 * frame: the previous nine glass chips covered the top-left of the feed and
 * their legibility depended on what the camera happened to be looking at.
 */
export function HeroView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const [heroMode, setHeroMode] = useState<'camera' | 'map'>('camera')
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('front')
  const [muted, setMuted] = useState(false)
  const ddsAvailable = robot.connectivity.dds === 'connected'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: color.videoBg }}>
      <div style={{ flexShrink: 0, background: color.surface }}>
        <TelemetryStrip robot={robot} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {heroMode === 'camera' ? (
          <CameraFeedLayer robot={robot} muted={muted} facing={cameraFacing} fit={cameraFit} />
        ) : (
          <MapCanvas robot={robot} mission={mission} variant="full" />
        )}

        {heroMode === 'camera' && (
          <CameraModeTabsOverlay
            mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable}
            facing={cameraFacing} onFacingChange={setCameraFacing}
            fit={cameraFit} onFitChange={setCameraFit}
            muted={muted} onToggleMute={() => setMuted((m) => !m)}
          />
        )}
        {heroMode === 'camera' && <CaptureRail robot={robot} facing={cameraFacing} hotkeys />}
        <HeroInset
          showing={heroMode === 'camera' ? 'map' : 'camera'}
          facing={cameraFacing}
          robot={robot}
          mission={mission}
          width={300}
          height={190}
          onSwap={() => setHeroMode((m) => (m === 'camera' ? 'map' : 'camera'))}
        />
        {robot.control_owner != null && <ManualControlOverlay robot={robot} />}
        <QuickActionsMenu robot={robot} />
        <CommandAckToast />
      </div>
    </div>
  )
}

import { useRemembered } from '@/lib/viewMemory'
import { shownCameraMode, useMainCamera } from '@/liveops/cameraChoice'
import { COCKPIT_MAIN_KEY, isCockpitMain } from '@/liveops/liveOpsToggles'
import { color } from '@/design-system/tokens'
import { TelemetryStrip } from '@/components/liveops/feed/TelemetryPanel'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { useSiteMap } from '@/liveops/useSiteMap'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CaptureRail } from './CaptureRail'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { HeroInset } from './HeroInset'
import { ManualControlOverlay } from './ManualControlOverlay'
import { operatorHoldsControl } from '@/liveops/controlOwner'
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
  const siteMap = useSiteMap()
  // Which picture has the pane is the viewer's own layout, remembered for them.
  const [heroMode, setHeroMode] = useRemembered(COCKPIT_MAIN_KEY, 'camera', isCockpitMain)
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const cameraSteady = useSessionStore((s) => s.cameraSteady)
  const setCameraSteady = useSessionStore((s) => s.setCameraSteady)
  // The robot's remembered main camera, shared by every layout
  // (liveops/cameraChoice): switching layout or reloading keeps it. Depth is
  // shown as RGB while DDS is down, and comes back with the link.
  const camera = useMainCamera(robot.robot_id)
  const cameraFacing = camera.facing
  const ddsAvailable = robot.connectivity.dds === 'connected'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: color.videoBg }}>
      <div style={{ flexShrink: 0, background: color.surface }}>
        <TelemetryStrip robot={robot} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {heroMode === 'camera' ? (
          <CameraFeedLayer robot={robot} facing={cameraFacing} fit={cameraFit} steady />
        ) : (
          <MapCanvas robot={robot} mission={mission} variant="full" {...siteMap} />
        )}

        {heroMode === 'camera' && (
          <CameraModeTabsOverlay
            mode={shownCameraMode(camera.mode, ddsAvailable)} onChange={camera.setMode} ddsAvailable={ddsAvailable}
            facing={cameraFacing} onFacingChange={camera.setFacing}
            fit={cameraFit} onFitChange={setCameraFit}
            steady={cameraSteady} onSteadyChange={setCameraSteady}
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
          onSwap={() => setHeroMode(heroMode === 'camera' ? 'map' : 'camera')}
        />
        {operatorHoldsControl(robot) && <ManualControlOverlay robot={robot} />}
        <QuickActionsMenu robot={robot} />
        <CommandAckToast />
      </div>
    </div>
  )
}

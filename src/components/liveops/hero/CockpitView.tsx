import { useState } from 'react'
import { color } from '@/design-system/tokens'
import { type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { useSessionStore } from '@/store/useSessionStore'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { CockpitStatusOverlay } from './CockpitStatusOverlay'
import { HeroInset } from './HeroInset'
import { ManualControlOverlay } from './ManualControlOverlay'
import type { Mission, RobotState } from '@/types'

/**
 * Cockpit view mode (docs/05-ui-ux.md §4): status overlaid on the dominant
 * view instead of a persistent rail, and the left rail collapsed (§3, handled
 * by LiveOpsWorkspace not rendering LeftRail in this mode). Command bar /
 * E-Stop / bottom bar are unaffected.
 *
 * The dominant view is the **camera** by default, with the map in the inset,
 * and the two swap. It was previously map-dominant with a fixed camera
 * picture-in-picture, which had two consequences: the mode an operator reaches
 * for to *drive* led with the map rather than the view they steer by, and
 * because the camera was never the dominant view the camera controls were
 * deliberately omitted — so RGB/Depth, Fit/Fill and the front/back facing
 * toggle simply did not exist in Cockpit, and the PiP was hardcoded to the
 * front camera with no way to see behind the robot.
 *
 * NOTE: docs/05-ui-ux.md §4 still describes Cockpit as map-expanded; that
 * paragraph needs updating to match.
 */
export function CockpitView({ robot, mission }: {
  robot: RobotState; mission?: Mission
}) {
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const [dominant, setDominant] = useState<'camera' | 'map'>('camera')
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('front')
  const [muted, setMuted] = useState(false)
  const ddsAvailable = robot.connectivity.dds === 'connected'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: color.videoBg }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {dominant === 'camera' ? (
          <CameraFeedLayer robot={robot} muted={muted} facing={cameraFacing} fit={cameraFit} />
        ) : (
          <MapCanvas robot={robot} mission={mission} variant="full" />
        )}

        <CockpitStatusOverlay robot={robot} />

        {/* Camera controls belong wherever the camera is actually on screen. */}
        {dominant === 'camera' && (
          <CameraModeTabsOverlay
            mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable}
            facing={cameraFacing} onFacingChange={setCameraFacing}
            fit={cameraFit} onFitChange={setCameraFit}
            muted={muted} onToggleMute={() => setMuted((m) => !m)}
          />
        )}

        <HeroInset
          showing={dominant === 'camera' ? 'map' : 'camera'}
          robot={robot}
          mission={mission}
          facing={cameraFacing}
          onSwap={() => setDominant((d) => (d === 'camera' ? 'map' : 'camera'))}
        />

        {robot.control_owner != null && <ManualControlOverlay robot={robot} />}
        <CommandAckToast />
      </div>
    </div>
  )
}

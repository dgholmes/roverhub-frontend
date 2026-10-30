import { useState } from 'react'
import { color } from '@/design-system/tokens'
import { type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { TelemetryStrip } from '@/components/liveops/feed/TelemetryPanel'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CaptureRail } from './CaptureRail'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { ManualControlOverlay } from './ManualControlOverlay'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import type { Mission, RobotState } from '@/types'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * Map + camera side by side (docs/05-ui-ux.md §4), shown simultaneously
 * rather than swapped. Telemetry is the same docked strip as the Camera view,
 * spanning both panes, so neither pane is covered by readouts.
 */
export function SplitView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('front')
  const [muted, setMuted] = useState(false)
  const ddsAvailable = robot.connectivity.dds === 'connected'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: color.videoBg, position: 'relative' }}>
      <div style={{ flexShrink: 0, background: color.surface }}>
        <TelemetryStrip robot={robot} />
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <MapCanvas robot={robot} mission={mission} variant="full" />
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <CameraFeedLayer robot={robot} muted={muted} facing={cameraFacing} fit={cameraFit} />
          <CameraModeTabsOverlay
            mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable}
            facing={cameraFacing} onFacingChange={setCameraFacing}
            fit={cameraFit} onFitChange={setCameraFit}
            muted={muted} onToggleMute={() => setMuted((m) => !m)}
          />
          <CaptureRail robot={robot} facing={cameraFacing} hotkeys />
        </div>
      </div>

      {/* Gated on control ownership, matching the other views. This used to
          mount on `abstract_state === MANUAL || ASSISTED`, which armed the WASD
          listeners for any robot merely *reporting* those states — including
          one another operator holds, and a wheel robot that reports MANUAL
          simply for being upright. docs/audit/2026-08-12-ui-ux-audit.md A-10. */}
      {operatorHoldsControl(robot) && <ManualControlOverlay robot={robot} />}
      <CommandAckToast />
    </div>
  )
}

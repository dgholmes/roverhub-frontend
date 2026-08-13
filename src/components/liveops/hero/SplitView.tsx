import { useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { TelemetryOverlay } from '@/components/liveops/feed/TelemetryOverlay'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { ViewModeSelector } from '@/components/shell/ViewModeSelector'
import type { FullscreenControl } from '@/liveops/useFullscreenToggle'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { FullscreenButton } from './FullscreenButton'
import { ManualControlOverlay } from './ManualControlOverlay'
import type { Mission, RobotState } from '@/types'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * Camera + Map Split view mode (docs/05-ui-ux.md §4): 50/50 vertical split
 * between map and camera feed, shown simultaneously rather than swapped. The
 * status rail is retained — LiveOpsWorkspace keeps rendering LeftRail
 * alongside this view (only Cockpit collapses it, per §3).
 */
export function SplitView({ robot, mission, fullscreen }: {
  robot: RobotState; mission?: Mission; fullscreen: FullscreenControl
}) {
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('front')
  const [muted, setMuted] = useState(false)
  const ddsAvailable = robot.connectivity.dds === 'connected'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: '#0D0D0F', position: 'relative' }}>
      <div style={{
        height: 44, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[3],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flex: 1, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.accent, boxShadow: '0 0 5px rgba(170,255,0,0.7)', flexShrink: 0 }} />
          <span style={{
            fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Split View — {robot.name}
          </span>
        </div>

        <RobotSelector />
        <ViewModeSelector />
        <FullscreenButton isFullscreen={fullscreen.isFullscreen} onToggle={fullscreen.onToggle} />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0, borderRight: `1px solid ${color.border}` }}>
          <CameraFeedLayer robot={robot} muted={muted} fit={cameraFit} />
          <TelemetryOverlay robot={robot} />
          <CameraModeTabsOverlay
            mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable}
            facing={cameraFacing} onFacingChange={setCameraFacing}
            fit={cameraFit} onFitChange={setCameraFit}
            muted={muted} onToggleMute={() => setMuted((m) => !m)}
          />
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <MapCanvas robot={robot} mission={mission} variant="full" />
        </div>
      </div>

      {/* Gated on control ownership, matching HeroView and CockpitView. This
          used to mount on `abstract_state === MANUAL || ASSISTED`, which arms
          the WASD listeners for any robot merely *reporting* those states —
          including one another operator holds, and including a wheel robot
          that reports MANUAL simply for being upright (`wheel_loco` is both its
          upright state and its drive state). Switching view mode therefore
          silently armed or disarmed driving.
          docs/audit/2026-08-12-ui-ux-audit.md A-10. */}
      {robot.control_owner != null && <ManualControlOverlay robot={robot} />}
      <CommandAckToast />
    </div>
  )
}

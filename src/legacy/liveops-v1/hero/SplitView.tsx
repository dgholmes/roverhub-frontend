import { useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { CameraModeTabs, type CameraMode } from '@/legacy/liveops-v1/feed/CameraModeTabs'
import { TelemetryOverlay } from '@/legacy/liveops-v1/feed/TelemetryOverlay'
import { MapCanvas } from '@/legacy/liveops-v1/map/MapCanvas'
import { CommandAckToast } from '@/legacy/liveops-v1/command/CommandAckToast'
import { useLiveOpsStore } from '@/legacy/liveops-v1/store/useLiveOpsStore'
import { useFullscreenToggle } from '@/legacy/liveops-v1/liveops/useFullscreenToggle'
import { CameraFeedLayer } from './CameraFeedLayer'
import { RecIndicator } from './RecIndicator'
import { MediaControlsOverlay } from './MediaControlsOverlay'
import { FullscreenButton } from './FullscreenButton'
import type { Mission, RobotState } from '@/legacy/liveops-v1/types'

/**
 * Camera + Map Split view mode (docs/05-ui-ux.md §4): 50/50 vertical split
 * between map and camera feed, shown simultaneously rather than swapped. The
 * status rail is retained — LiveOpsWorkspace keeps rendering LeftRail
 * alongside this view (only Cockpit collapses it, per §3).
 */
export function SplitView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const ddsAvailable = robot.connectivity.dds === 'connected'
  const { ref, isFullscreen, toggle } = useFullscreenToggle<HTMLDivElement>()

  return (
    <div ref={ref} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0D0D0F', position: 'relative' }}>
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

        <CameraModeTabs mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable} />
        <FullscreenButton isFullscreen={isFullscreen} onToggle={toggle} />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0, borderRight: `1px solid ${color.border}` }}>
          <CameraFeedLayer robot={robot} />
          <TelemetryOverlay robot={robot} />
          <RecIndicator />
          <MediaControlsOverlay onSnapshot={() => dispatchCommand(robot.robot_id, 'SNAPSHOT', 'Snapshot')} />
        </div>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <MapCanvas robot={robot} mission={mission} variant="full" />
        </div>
      </div>

      <CommandAckToast />
    </div>
  )
}

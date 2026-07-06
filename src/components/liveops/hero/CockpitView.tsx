import { useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { CameraModeTabs, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { ViewModeSelector } from '@/components/shell/ViewModeSelector'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useFullscreenToggle } from '@/liveops/useFullscreenToggle'
import { RecIndicator } from './RecIndicator'
import { MediaControlsOverlay } from './MediaControlsOverlay'
import { CockpitStatusOverlay } from './CockpitStatusOverlay'
import { CameraPipPanel } from './CameraPipPanel'
import { FullscreenButton } from './FullscreenButton'
import type { Mission, RobotState } from '@/types'

/**
 * Cockpit view mode (docs/05-ui-ux.md §4): map expanded to near-full width,
 * status overlaid on the map instead of a persistent rail, camera fixed as a
 * picture-in-picture corner. Command bar / E-Stop / bottom timeline are
 * unaffected — only the left rail collapses (§3), which LiveOpsWorkspace
 * handles by simply not rendering LeftRail in this mode.
 */
export function CockpitView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const ddsAvailable = robot.connectivity.dds === 'connected'
  const { ref, isFullscreen, toggle } = useFullscreenToggle<HTMLDivElement>()

  return (
    <div ref={ref} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0D0D0F' }}>
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
            Cockpit — {robot.name}
          </span>
        </div>

        <RobotSelector />
        <ViewModeSelector />
        <CameraModeTabs mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable} />
        <FullscreenButton isFullscreen={isFullscreen} onToggle={toggle} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <MapCanvas robot={robot} mission={mission} variant="full" />

        <CockpitStatusOverlay robot={robot} />
        <RecIndicator />
        <CameraPipPanel />
        <MediaControlsOverlay onSnapshot={() => dispatchCommand(robot.robot_id, 'SNAPSHOT', 'Snapshot')} />
        <CommandAckToast />
      </div>
    </div>
  )
}

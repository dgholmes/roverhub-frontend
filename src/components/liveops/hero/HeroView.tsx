import { useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { TelemetryOverlay } from '@/components/liveops/feed/TelemetryOverlay'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { ViewModeSelector } from '@/components/shell/ViewModeSelector'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useFullscreenToggle } from '@/liveops/useFullscreenToggle'
import { CameraFeedLayer } from './CameraFeedLayer'
import { RecIndicator } from './RecIndicator'
import { MediaControlsOverlay } from './MediaControlsOverlay'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { HeroInset } from './HeroInset'
import { FullscreenButton } from './FullscreenButton'
import { ManualControlOverlay } from './ManualControlOverlay'
import { QuickActionsMenu } from '@/components/liveops/command/QuickActionsMenu'
import type { Mission, RobotState } from '@/types'

/**
 * Default LiveOps view mode (docs/05-ui-ux.md §4). One dominant view at a
 * time — camera feed or map — swapped via the inset's swap icon (bottom-left).
 * Telemetry/media-control overlays stay identical regardless of which is
 * dominant (they act on the robot, not the viewport), but the camera mode
 * tabs only make sense — and only render — when the camera feed is actually
 * what's showing.
 */
export function HeroView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const [heroMode, setHeroMode] = useState<'camera' | 'map'>('camera')
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('front')
  const [muted, setMuted] = useState(false)
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
            {heroMode === 'camera' ? 'Live View' : 'Map View'} — {robot.name}
          </span>
        </div>

        <RobotSelector />
        <ViewModeSelector />
        <FullscreenButton isFullscreen={isFullscreen} onToggle={toggle} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {heroMode === 'camera' ? (
          <CameraFeedLayer robot={robot} muted={muted} />
        ) : (
          <MapCanvas robot={robot} mission={mission} variant="full" />
        )}

        <TelemetryOverlay robot={robot} />
        <RecIndicator />
        {heroMode === 'camera' && (
          <CameraModeTabsOverlay
            mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable}
            facing={cameraFacing} onFacingChange={setCameraFacing}
          />
        )}
        <HeroInset
          showing={heroMode === 'camera' ? 'map' : 'camera'}
          robot={robot}
          mission={mission}
          onSwap={() => setHeroMode((m) => (m === 'camera' ? 'map' : 'camera'))}
        />
        <MediaControlsOverlay
          onSnapshot={() => dispatchCommand(robot.robot_id, 'SNAPSHOT', 'Snapshot')}
          muted={muted} onToggleMute={() => setMuted((m) => !m)}
        />
        {(robot.abstract_state === 'MANUAL' || robot.abstract_state === 'ASSISTED') && (
          <ManualControlOverlay robot={robot} />
        )}
        <QuickActionsMenu
          robot={robot}
          onSetState={(state, label) => dispatchCommand(robot.robot_id, 'SET_STATE', label, { state })}
        />
        <CommandAckToast />
      </div>
    </div>
  )
}

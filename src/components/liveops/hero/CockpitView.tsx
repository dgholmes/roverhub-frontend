import { color, font, space } from '@/design-system/tokens'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { ViewModeSelector } from '@/components/shell/ViewModeSelector'
import { useFullscreenToggle } from '@/liveops/useFullscreenToggle'
import { RecIndicator } from './RecIndicator'
import { CockpitStatusOverlay } from './CockpitStatusOverlay'
import { CameraPipPanel } from './CameraPipPanel'
import { FullscreenButton } from './FullscreenButton'
import { ManualControlOverlay } from './ManualControlOverlay'
import type { Mission, RobotState } from '@/types'

/**
 * Cockpit view mode (docs/05-ui-ux.md §4): map expanded to near-full width,
 * status overlaid on the map instead of a persistent rail, camera fixed as a
 * picture-in-picture corner. No camera mode tabs here — the map is always
 * the dominant view in Cockpit, so RGB/Depth/Thermal switching (which acts
 * on the camera feed) doesn't apply; it only appears where the camera feed
 * is actually what's on screen (HeroView, SplitView). Command bar / E-Stop /
 * bottom timeline are unaffected — only the left rail collapses (§3), which
 * LiveOpsWorkspace handles by simply not rendering LeftRail in this mode.
 */
export function CockpitView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
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
        <FullscreenButton isFullscreen={isFullscreen} onToggle={toggle} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <MapCanvas robot={robot} mission={mission} variant="full" />

        <CockpitStatusOverlay robot={robot} />
        <RecIndicator />
        <CameraPipPanel />
        {robot.control_owner != null && <ManualControlOverlay robot={robot} />}
        <CommandAckToast />
      </div>
    </div>
  )
}

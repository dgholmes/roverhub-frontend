import { color, font, layout, space } from '@/design-system/tokens'
import { SiteSelector } from './SiteSelector'
import { RobotSelector } from './RobotSelector'
import { ViewModeSelector } from './ViewModeSelector'
import { AlertCenterButton } from './AlertCenterButton'
import { OperatorProfile } from './OperatorProfile'
import type { Workspace } from '@/app/routes'

const ROBOT_SCOPED_WORKSPACES: Workspace[] = ['LiveOps', 'Fleet']

/**
 * Site-level top bar. Workspace navigation lives in WorkspaceSidebar now
 * (converted from top tabs per operator feedback) — this only carries
 * site/robot/view-mode context and global chrome.
 */
export function TopBar({ workspace }: { workspace: Workspace }) {
  return (
    <header style={{
      height: layout.topBarHeight, background: color.surface, borderBottom: `1px solid ${color.border}`,
      display: 'flex', alignItems: 'center', padding: `0 ${space[5]}px`,
      flexShrink: 0, zIndex: 10, gap: space[4],
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 176 }}>
        <img src="/rover.png" alt="RoverHub" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        <div>
          <div style={{ fontWeight: font.weight.bold, fontSize: font.size.xl, color: color.t1, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            RoverHub
          </div>
          <div style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.regular }}>
            Quadruped Control System
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexShrink: 0 }}>
        <SiteSelector />
        {ROBOT_SCOPED_WORKSPACES.includes(workspace) && <RobotSelector />}
        {workspace === 'LiveOps' && <ViewModeSelector />}

        <div style={{ width: 1, height: 28, background: color.border }} />
        <AlertCenterButton />
        <div style={{ width: 1, height: 28, background: color.border }} />

        <OperatorProfile />
      </div>
    </header>
  )
}

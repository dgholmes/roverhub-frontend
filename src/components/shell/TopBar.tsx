import { ChevronDown } from 'lucide-react'
import { color, font, layout, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import { WorkspaceNav } from './WorkspaceNav'
import { SiteSelector } from './SiteSelector'
import { RobotSelector } from './RobotSelector'
import { ViewModeSelector } from './ViewModeSelector'
import { AlertCenterButton } from './AlertCenterButton'
import type { Workspace } from '@/app/routes'

const ROBOT_SCOPED_WORKSPACES: Workspace[] = ['LiveOps', 'Fleet']

export function TopBar({ active, onSelect }: { active: Workspace; onSelect: (w: Workspace) => void }) {
  const operatorName = useSessionStore((s) => s.operatorName)
  const role = useSessionStore((s) => s.role)

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

      <WorkspaceNav active={active} onSelect={onSelect} />

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexShrink: 0 }}>
        <SiteSelector />
        {ROBOT_SCOPED_WORKSPACES.includes(active) && <RobotSelector />}
        {active === 'LiveOps' && <ViewModeSelector />}

        <div style={{ width: 1, height: 28, background: color.border }} />
        <AlertCenterButton />
        <div style={{ width: 1, height: 28, background: color.border }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: color.card, border: `1.5px solid ${color.borderLt}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.t2,
            fontFamily: font.family, letterSpacing: '-0.02em',
          }}>
            {operatorName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, lineHeight: 1.3 }}>
              {operatorName}
            </div>
            <div style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.2, textTransform: 'capitalize' }}>
              {role}
            </div>
          </div>
          <ChevronDown size={12} color={color.t3} strokeWidth={2} />
        </div>
      </div>
    </header>
  )
}

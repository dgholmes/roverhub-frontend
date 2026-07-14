import { Bot, Building2, Database, Radar, Route, Settings2 } from 'lucide-react'
import { color, radius, space } from '@/design-system/tokens'
import { IconSidebar } from './IconSidebar'
import { AlertCenterButton } from './AlertCenterButton'
import { WORKSPACES, type Workspace } from '@/app/routes'

const ICONS: Record<Workspace, React.ElementType> = {
  LiveOps: Radar, Fleet: Bot, Missions: Route, Data: Database, Systems: Settings2,
}

/** Site-level workspace nav (docs/05-ui-ux.md §2.1) — converted from top
 * tabs to an icon rail per operator feedback, matching the FlightHub-style
 * project navigation pattern. */
export function WorkspaceSidebar({
  active, onSelect, onBackToOrg,
}: {
  active: Workspace
  onSelect: (w: Workspace) => void
  onBackToOrg: () => void
}) {
  const items = WORKSPACES.map((w) => ({
    key: w, label: w, icon: ICONS[w], active: w === active, onClick: () => onSelect(w),
  }))

  return (
    <IconSidebar
      items={items}
      topSlot={
        <button
          onClick={onBackToOrg}
          title="Back to Organization"
          aria-label="Back to Organization"
          style={{
            width: 48, height: 48, borderRadius: radius.md, marginBottom: space[2],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: `1px solid ${color.border}`, color: color.t2, cursor: 'pointer',
          }}
        >
          <Building2 size={18} strokeWidth={1.8} />
        </button>
      }
      bottomSlot={<AlertCenterButton variant="sidebar" direction="right" />}
    />
  )
}

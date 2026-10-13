import { Bot, Database, Radar, Route, Settings2 } from 'lucide-react'
import { radius, space } from '@/design-system/tokens'
import { IconSidebar } from './IconSidebar'
import { AlertCenterButton } from './AlertCenterButton'
import { WORKSPACES, type Workspace } from '@/app/routes'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const items = WORKSPACES.map((w) => ({
    key: w, label: t(`nav.workspace.${w}`), icon: ICONS[w], active: w === active, onClick: () => onSelect(w),
  }))

  return (
    <IconSidebar
      items={items}
      topSlot={
        // The brand mark doubles as the way back to the organization, as the
        // logo does in most consoles; the label says so on hover and to AT.
        <button
          onClick={onBackToOrg}
          title={t('common.backToOrg')}
          aria-label={t('common.backToOrgAria')}
          style={{
            width: 44, height: 44, borderRadius: radius.md, marginBottom: space[3],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <img className="rh-logo" src="./rover-mark.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        </button>
      }
      bottomSlot={<AlertCenterButton variant="sidebar" direction="right" />}
    />
  )
}

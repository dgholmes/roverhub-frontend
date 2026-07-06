import { Building2, Cpu, LayoutDashboard, Settings, Users } from 'lucide-react'
import { IconSidebar } from '@/components/shell/IconSidebar'
import { ORG_PAGES, type OrgPage } from '@/app/routes'

const ICONS: Record<OrgPage, React.ElementType> = {
  Dashboard: LayoutDashboard, Sites: Building2, Team: Users, Devices: Cpu, Settings: Settings,
}

/** Org-level page nav — same icon-rail pattern as the site-level
 * WorkspaceSidebar, so both levels read as one consistent navigation model. */
export function OrgSidebar({ active, onSelect }: { active: OrgPage; onSelect: (p: OrgPage) => void }) {
  const items = ORG_PAGES.map((p) => ({
    key: p, label: p, icon: ICONS[p], active: p === active, onClick: () => onSelect(p),
  }))

  return <IconSidebar items={items} />
}

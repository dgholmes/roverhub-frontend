import { color, font } from '@/design-system/tokens'
import { OrgTopBar } from '@/components/org/OrgTopBar'
import { OrgDashboardPage } from '@/components/org/pages/OrgDashboardPage'
import { SitesPage } from '@/components/org/pages/SitesPage'
import { TeamRolesPage } from '@/components/org/pages/TeamRolesPage'
import { DevicesPage } from '@/components/org/pages/DevicesPage'
import { OrgSettingsPage } from '@/components/org/pages/OrgSettingsPage'
import { hashForOrgPage, type OrgPage } from './routes'

/** Organization Console (docs/01-prd.md §6.4) — the level above sites. Keeps
 * the original TopBar + top-tab nav pattern; only the site level uses a
 * sidebar. */
export function OrgShell({ page }: { page: OrgPage }) {
  function navigate(p: OrgPage) {
    window.location.hash = hashForOrgPage(p)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: color.bg, fontFamily: font.family,
    }}>
      <OrgTopBar active={page} onSelect={navigate} />
      {page === 'Dashboard' ? <OrgDashboardPage />
        : page === 'Sites' ? <SitesPage />
        : page === 'Team' ? <TeamRolesPage />
        : page === 'Devices' ? <DevicesPage />
        : <OrgSettingsPage />}
    </div>
  )
}

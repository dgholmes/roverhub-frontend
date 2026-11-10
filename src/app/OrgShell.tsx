import { useEffect } from 'react'
import { color, font } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { OrgTopBar } from '@/components/org/OrgTopBar'
import { OrgDashboardPage } from '@/components/org/pages/OrgDashboardPage'
import { SitesPage } from '@/components/org/pages/SitesPage'
import { TeamRolesPage } from '@/components/org/pages/TeamRolesPage'
import { DevicesPage } from '@/components/org/pages/DevicesPage'
import { OrgSettingsPage } from '@/components/org/pages/OrgSettingsPage'
import { hashForOrgPage, type OrgPage } from './routes'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

/** Organization Console (docs/01-prd.md §6.4) — the level above sites. Keeps
 * the original TopBar + top-tab nav pattern; only the site level uses a
 * sidebar. */
export function OrgShell({ page }: { page: OrgPage }) {
  // Org pages summarise live robots, so they need the same feed LiveOps and
  // Fleet start. init() is idempotent.
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  function navigate(p: OrgPage) {
    window.location.hash = hashForOrgPage(p)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: color.bg, fontFamily: font.family,
    }}>
      <OrgTopBar active={page} onSelect={navigate} />
      {/* A fault in one page keeps the top bar, and another page is a fresh try. */}
      <ErrorBoundary area={`org ${page} page`} variant="page" resetKeys={[page]}>
      {page === 'Dashboard' ? <OrgDashboardPage />
        : page === 'Sites' ? <SitesPage />
        : page === 'Team' ? <TeamRolesPage />
        : page === 'Devices' ? <DevicesPage />
        : <OrgSettingsPage />}
      </ErrorBoundary>
    </div>
  )
}

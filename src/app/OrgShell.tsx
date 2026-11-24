import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, LayoutDashboard, Settings2, Server, Users } from 'lucide-react'
import { VIEWPORT_CLASS, VIEWPORT_CSS } from './viewport'
import { color, font } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { OrgTopBar } from '@/components/org/OrgTopBar'
import { OrgTouchHeader } from '@/components/org/OrgTouchHeader'
import { TouchTabBar } from '@/components/shell/TouchTabBar'
import { useTouchShell } from '@/lib/useTouchShell'
import { shouldShowTabBar } from './touchNav'
import { OrgDashboardPage } from '@/components/org/pages/OrgDashboardPage'
import { SitesPage } from '@/components/org/pages/SitesPage'
import { TeamRolesPage } from '@/components/org/pages/TeamRolesPage'
import { DevicesPage } from '@/components/org/pages/DevicesPage'
import { OrgSettingsPage } from '@/components/org/pages/OrgSettingsPage'
import { hashForOrgPage, ORG_PAGES, type OrgPage } from './routes'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

const ORG_PAGE_ICONS: Record<OrgPage, React.ElementType> = {
  Dashboard: LayoutDashboard, Sites: Building2, Team: Users, Devices: Server, Settings: Settings2,
}

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

  const { t } = useTranslation()
  const { touch } = useTouchShell()
  // The org console has no LiveOps, so the bar is never hidden for driving.
  const showTabBar = shouldShowTabBar({ touch, workspace: null, driving: false })

  function navigate(p: OrgPage) {
    window.location.hash = hashForOrgPage(p)
  }

  return (
    <div className={VIEWPORT_CLASS} style={{
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: color.bg, fontFamily: font.family,
    }}>
      <style>{VIEWPORT_CSS}</style>
      {touch ? <OrgTouchHeader /> : <OrgTopBar active={page} onSelect={navigate} />}
      {/* A fault in one page keeps the top bar, and another page is a fresh try. */}
      <ErrorBoundary area={`org ${page} page`} variant="page" resetKeys={[page]}>
      {page === 'Dashboard' ? <OrgDashboardPage />
        : page === 'Sites' ? <SitesPage />
        : page === 'Team' ? <TeamRolesPage />
        : page === 'Devices' ? <DevicesPage />
        : <OrgSettingsPage />}
      </ErrorBoundary>
      {/* Bare, as SiteShell renders it: TouchTabBar carries the marker and
          `flexShrink: 0` itself, and a wrapper here made the marker count 2. */}
      {showTabBar && (
        <TouchTabBar
          items={ORG_PAGES}
          active={page}
          label={(p) => t(`nav.org.${p}`)}
          icon={(p) => ORG_PAGE_ICONS[p]}
          onSelect={navigate}
          ariaLabel={t('touch.nav.orgAria')}
        />
      )}
    </div>
  )
}

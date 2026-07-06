import { useEffect } from 'react'
import { color, font } from '@/design-system/tokens'
import { TopBar } from '@/components/shell/TopBar'
import { WorkspaceSidebar } from '@/components/shell/WorkspaceSidebar'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { ComingSoon } from './ComingSoon'
import { hashForSiteWorkspace, type Workspace } from './routes'

/**
 * Site-level shell — what used to be the whole app (AppShell) before the
 * Organization Console was introduced above it. Workspace navigation is now
 * an icon sidebar (WorkspaceSidebar) instead of TopBar tabs.
 */
export function SiteShell({ siteId, workspace }: { siteId: string; workspace: Workspace }) {
  const setActiveSite = useSessionStore((s) => s.setActiveSite)

  useEffect(() => {
    setActiveSite(siteId)
  }, [siteId, setActiveSite])

  function navigateWorkspace(w: Workspace) {
    window.location.hash = hashForSiteWorkspace(siteId, w)
  }

  function backToOrg() {
    window.location.hash = '#/org/sites'
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: color.bg, fontFamily: font.family,
    }}>
      <TopBar workspace={workspace} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <WorkspaceSidebar active={workspace} onSelect={navigateWorkspace} onBackToOrg={backToOrg} />
        {workspace === 'LiveOps' ? <LiveOpsWorkspace />
          : workspace === 'Fleet' ? <FleetWorkspace />
          : <ComingSoon workspace={workspace} />}
      </div>
    </div>
  )
}

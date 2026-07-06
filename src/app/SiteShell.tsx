import { useEffect } from 'react'
import { color, font } from '@/design-system/tokens'
import { WorkspaceSidebar } from '@/components/shell/WorkspaceSidebar'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { ComingSoon } from './ComingSoon'
import { hashForSiteWorkspace, type Workspace } from './routes'

/**
 * Site-level shell — deliberately has no top bar. Per operator feedback,
 * entering a site is meant to feel like a separate, focused surface: just
 * the workspace sidebar and its content, no app chrome above it.
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
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: color.bg, fontFamily: font.family,
    }}>
      <WorkspaceSidebar active={workspace} onSelect={navigateWorkspace} onBackToOrg={backToOrg} />
      {workspace === 'LiveOps' ? <LiveOpsWorkspace />
        : workspace === 'Fleet' ? <FleetWorkspace />
        : <ComingSoon workspace={workspace} />}
    </div>
  )
}

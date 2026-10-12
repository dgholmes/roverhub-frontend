import { useEffect } from 'react'
import { color, font } from '@/design-system/tokens'
import { WorkspaceSidebar } from '@/components/shell/WorkspaceSidebar'
import { SiteContextStrip } from '@/components/shell/SiteContextStrip'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { MissionsWorkspace } from '@/components/missions/MissionsWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { ComingSoon } from './ComingSoon'
import { hashForSiteWorkspace, type Workspace } from './routes'

/**
 * Site-level shell — deliberately has no app-wide top bar. Per operator
 * feedback, entering a site is meant to feel like a separate, focused surface:
 * the workspace rail, one slim context bar (SiteContextStrip), and content.
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* LiveOps renders this bar itself, inside its fullscreen root, so the
            robot selector and view modes stay reachable in fullscreen. */}
        {workspace !== 'LiveOps' && <SiteContextStrip siteId={siteId} workspace={workspace} />}
        {workspace === 'LiveOps' ? <LiveOpsWorkspace siteId={siteId} />
          : workspace === 'Fleet' ? <FleetWorkspace />
          : workspace === 'Missions' ? <MissionsWorkspace />
          : <ComingSoon workspace={workspace} />}
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { color, font } from '@/design-system/tokens'
import { WorkspaceSidebar } from '@/components/shell/WorkspaceSidebar'
import { SiteContextStrip } from '@/components/shell/SiteContextStrip'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { MissionsWorkspace } from '@/components/missions/MissionsWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { isKnownSite } from '@/liveops/siteScope'
import { ComingSoon } from './ComingSoon'
import { SiteNotFound } from './SiteNotFound'
import { hashForSiteWorkspace, type Workspace } from './routes'

/**
 * Site-level shell — deliberately has no top bar. Per operator feedback,
 * entering a site is meant to feel like a separate, focused surface: just
 * the workspace sidebar and its content, no app chrome above it.
 */
export function SiteShell({ siteId, workspace }: { siteId: string; workspace: Workspace }) {
  const setActiveSite = useSessionStore((s) => s.setActiveSite)
  const sites = useSessionStore((s) => s.sites)
  const known = isKnownSite(sites, siteId)

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
        <SiteContextStrip siteId={siteId} workspace={workspace} />
        {/* A route naming an unknown site gets a plain statement, not a
            workspace. The context strip's UNKNOWN SITE badge disclosed the
            problem but the workspace still rendered beneath it — and with
            scoping now in place that would be an empty Fleet table, which reads
            as "this site has no robots" rather than "there is no such site".
            docs/audit/2026-08-12-ui-ux-audit.md A-34. */}
        {!known ? <SiteNotFound siteId={siteId} />
          : workspace === 'LiveOps' ? <LiveOpsWorkspace />
          : workspace === 'Fleet' ? <FleetWorkspace />
          : workspace === 'Missions' ? <MissionsWorkspace />
          : <ComingSoon workspace={workspace} />}
      </div>
    </div>
  )
}

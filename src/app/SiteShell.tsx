import { DataWorkspace } from '@/components/data/DataWorkspace'
import { useEffect } from 'react'
import { color, font } from '@/design-system/tokens'
import { WorkspaceSidebar } from '@/components/shell/WorkspaceSidebar'
import { SiteContextStrip } from '@/components/shell/SiteContextStrip'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { MissionsWorkspace } from '@/components/missions/MissionsWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { robotsForSite } from '@/org/siteRobots'
import { SiteEmptyNotice } from '@/components/shell/SiteEmptyNotice'
import { ComingSoon } from './ComingSoon'
import { NoSiteAccess } from './NoSiteAccess'
import { useSiteRole } from '@/org/useCan'
import { hashForSiteWorkspace, type Workspace } from './routes'

/**
 * Site-level shell — deliberately has no app-wide top bar. Per operator
 * feedback, entering a site is meant to feel like a separate, focused surface:
 * the workspace rail, one slim context bar (SiteContextStrip), and content.
 */
export function SiteShell({ siteId, workspace }: { siteId: string; workspace: Workspace }) {
  const setActiveSite = useSessionStore((s) => s.setActiveSite)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const role = useSiteRole()

  useEffect(() => {
    setActiveSite(siteId)
    // Move the selection onto one of this site's robots straight away, rather
    // than waiting for the next telemetry frame to do it.
    const here = robotsForSite(useLiveOpsStore.getState().robots, siteId)
    useSessionStore.getState().reconcileSelectedRobot(here.map((r) => r.robot_id))
  }, [siteId, setActiveSite])

  // Every workspace reads robots for the active site; until the store has
  // caught up with the route, it would show the previous site's.
  if (activeSiteId !== siteId) return null
  // Signed in with no role here. (With sign-in off the Role preview is never
  // empty, so this never shows.)
  if (role === null) return <NoSiteAccess />

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
        {/* LiveOps shows this in its own empty state. */}
        {workspace !== 'LiveOps' && <SiteEmptyNotice siteId={siteId} workspace={workspace} />}
        {/* Keyed by site so per-site state (the patrol grid layout, open
            panels) starts fresh instead of carrying across. */}
        <div key={siteId} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        {workspace === 'LiveOps' ? <LiveOpsWorkspace siteId={siteId} />
          : workspace === 'Fleet' ? <FleetWorkspace />
          : workspace === 'Missions' ? <MissionsWorkspace siteId={siteId} />
          : workspace === 'Data' ? <DataWorkspace siteId={siteId} />
          : <ComingSoon workspace={workspace} />}
        </div>
      </div>
    </div>
  )
}

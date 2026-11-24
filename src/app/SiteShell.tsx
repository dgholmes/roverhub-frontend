import { DataWorkspace } from '@/components/data/DataWorkspace'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font } from '@/design-system/tokens'
import { ICONS, WorkspaceSidebar } from '@/components/shell/WorkspaceSidebar'
import { SiteContextStrip } from '@/components/shell/SiteContextStrip'
import { TouchSiteBar } from '@/components/shell/TouchSiteBar'
import { TouchTabBar } from '@/components/shell/TouchTabBar'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { MissionsWorkspace } from '@/components/missions/MissionsWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { robotsForSite } from '@/org/siteRobots'
import { useSiteRobots } from '@/org/useSiteRobots'
import { resolveShownRobot } from '@/liveops/shownRobot'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import { useTouchShell } from '@/lib/useTouchShell'
import { SiteEmptyNotice } from '@/components/shell/SiteEmptyNotice'
import { SystemsWorkspace } from '@/components/systems/SystemsWorkspace'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { NoSiteAccess } from './NoSiteAccess'
import { useSiteRole } from '@/org/useCan'
import { shouldShowTabBar } from './touchNav'
import { hashForSiteWorkspace, WORKSPACES, type Workspace } from './routes'
import { VIEWPORT_CLASS, VIEWPORT_CSS } from './viewport'



/**
 * Site-level shell — deliberately has no app-wide top bar. Per operator
 * feedback, entering a site is meant to feel like a separate, focused surface:
 * the workspace rail, one slim context bar (SiteContextStrip), and content.
 *
 * On touch the rail is not rendered at all — 68 px is 17% of a 390 px phone,
 * permanently — and its five icons move to a bottom tab bar, with TouchSiteBar
 * carrying what else the rail held. The tab bar is a *sibling rendered after*
 * the content column, never a wrapper around it: LiveOps' fullscreen root is
 * inside that column and the E-Stop is inside the root, so wrapping would
 * either pull the bar into fullscreen or push the E-Stop out of it.
 */
export function SiteShell({ siteId, workspace }: { siteId: string; workspace: Workspace }) {
  const { t } = useTranslation()
  const setActiveSite = useSessionStore((s) => s.setActiveSite)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const role = useSiteRole()
  const { touch } = useTouchShell()
  // The robot the console is showing, read exactly as LiveOpsWorkspace reads
  // it, so "which robot?" has one answer here and there rather than two.
  const robots = useSiteRobots()
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const selectionPending = useSessionStore((s) => s.selectionPending)
  const { robot } = resolveShownRobot(robots, selectedRobotId, selectionPending)
  // `operatorHoldsControl` is the console's only "the operator is driving"
  // (design decision D2): a mission run and a tapped nav goal hold
  // `control_owner` too and nobody is steering with the bottom of the screen,
  // and a site with no robot is not driving either — all of those keep the bar.
  const driving = operatorHoldsControl(robot ?? undefined)
  const tabBar = shouldShowTabBar({ touch, workspace, driving })

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
    <div className={VIEWPORT_CLASS} style={{
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: color.bg, fontFamily: font.family,
    }}>
      <style>{VIEWPORT_CSS}</style>
      {/* The content row. `minHeight: 0` so it yields to the tab bar below
          instead of pushing it off the bottom of the viewport. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        {!touch && <WorkspaceSidebar active={workspace} onSelect={navigateWorkspace} onBackToOrg={backToOrg} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* LiveOps renders this bar itself, inside its fullscreen root, so the
              robot selector and view modes stay reachable in fullscreen. */}
          {workspace !== 'LiveOps' && (touch
            ? <TouchSiteBar siteId={siteId} />
            : <SiteContextStrip siteId={siteId} workspace={workspace} />)}
          {/* LiveOps shows this in its own empty state. */}
          {workspace !== 'LiveOps' && <SiteEmptyNotice siteId={siteId} workspace={workspace} />}
          {/* Keyed by site so per-site state (the patrol grid layout, open
              panels) starts fresh instead of carrying across. */}
          <div key={siteId} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {/* A fault inside one workspace shows a fallback here and leaves the
              navigation — the rail, or the tab bar below — so the operator can
              still reach LiveOps and its E-Stop. Changing workspace, or any
              other change of address (a Missions or Data sub-page, Back), is a
              fresh try; another site remounts it via the key above. */}
          <ErrorBoundary area={`${workspace} workspace`} variant="page" resetKeys={[workspace]}>
          {workspace === 'LiveOps' ? <LiveOpsWorkspace siteId={siteId} />
            : workspace === 'Fleet' ? <FleetWorkspace />
            : workspace === 'Missions' ? <MissionsWorkspace siteId={siteId} />
            : workspace === 'Data' ? <DataWorkspace siteId={siteId} />
            : <SystemsWorkspace siteId={siteId} />}
          </ErrorBoundary>
          </div>
        </div>
      </div>
      {/* Outside every boundary: a workspace that throws must not take the
          navigation with it. */}
      {tabBar && (
        <TouchTabBar
          items={WORKSPACES}
          active={workspace}
          label={(w) => t(`nav.workspace.${w}`)}
          icon={(w) => ICONS[w]}
          onSelect={navigateWorkspace}
          ariaLabel={t('touch.nav.workspacesAria')}
        />
      )}
    </div>
  )
}

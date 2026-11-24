import { hashForSiteWorkspace, type Workspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'

/** Opens a robot in one of its site's workspaces: selects the site and the
 * robot first, so LiveOps and Fleet open on that robot.
 *
 * Fleet gets a *request* rather than a plain selection, because on touch it
 * opens on its roster whatever the session holds (design decision D3) and
 * would otherwise land there having silently changed LiveOps' robot. The
 * other workspaces read the selection, so a request would only go stale. */
export function openRobot(siteId: string, robotId: string, workspace: Workspace = 'Fleet'): void {
  const s = useSessionStore.getState()
  s.setActiveSite(siteId)
  if (workspace === 'Fleet') s.requestRobot(robotId)
  else s.setSelectedRobot(robotId)
  window.location.hash = hashForSiteWorkspace(siteId, workspace)
}

export function enterSite(siteId: string, workspace: Workspace = 'LiveOps'): void {
  useSessionStore.getState().setActiveSite(siteId)
  window.location.hash = hashForSiteWorkspace(siteId, workspace)
}

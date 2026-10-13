import { hashForSiteWorkspace, type Workspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'

/** Opens a robot in one of its site's workspaces: selects the site and the
 * robot first, so LiveOps and Fleet open on that robot. */
export function openRobot(siteId: string, robotId: string, workspace: Workspace = 'Fleet'): void {
  const s = useSessionStore.getState()
  s.setActiveSite(siteId)
  s.setSelectedRobot(robotId)
  window.location.hash = hashForSiteWorkspace(siteId, workspace)
}

export function enterSite(siteId: string, workspace: Workspace = 'LiveOps'): void {
  useSessionStore.getState().setActiveSite(siteId)
  window.location.hash = hashForSiteWorkspace(siteId, workspace)
}

import { hashForFleetRobot, hashForSiteWorkspace, type RobotTab, type Workspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'

/** Opens a robot in one of its site's workspaces. Fleet is opened by address:
 * the hash names the robot (and the tab), so it opens that robot on every
 * screen size and browsing there does not touch LiveOps' selection. The other
 * workspaces read the session's selection, so that is set for them. */
export function openRobot(siteId: string, robotId: string, workspace: Workspace = 'Fleet', tab?: RobotTab): void {
  const s = useSessionStore.getState()
  s.setActiveSite(siteId)
  if (workspace === 'Fleet') {
    window.location.hash = hashForFleetRobot(siteId, robotId, tab)
    return
  }
  s.setSelectedRobot(robotId)
  window.location.hash = hashForSiteWorkspace(siteId, workspace)
}

export function enterSite(siteId: string, workspace: Workspace = 'LiveOps'): void {
  useSessionStore.getState().setActiveSite(siteId)
  window.location.hash = hashForSiteWorkspace(siteId, workspace)
}

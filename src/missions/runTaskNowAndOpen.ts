import { hashForSiteWorkspace } from '@/app/routes'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { MissionLibraryEntry, MissionTask } from '@/types'
import { startTaskRun, type StartTaskRunResult } from './startTaskRun'

/**
 * Run now from the Schedule page: start the task's mission on its robot, and on
 * success open LiveOps with that robot selected. A refusal comes back to the
 * caller to keep in view; nothing navigates.
 */
export async function runTaskNowAndOpen(siteId: string, task: MissionTask, mission: MissionLibraryEntry): Promise<StartTaskRunResult> {
  const result = await startTaskRun({
    // Through the store, so START_MISSION is tracked: an edge refusal after the
    // 201 reaches LiveOps' toasts and Logs, and the bar says Starting meanwhile.
    runTaskNow: (id, steps) => useLiveOpsStore.getState().runTaskNow(id, steps),
    makeClip: (robotId, text) => useLiveOpsStore.getState().createSpokenClip(robotId, text),
    robotType: (robotId) => useLiveOpsStore.getState().robots.find((r) => r.robot_id === robotId)?.robot_type ?? null,
  }, task, mission)
  if (result.ok) {
    useSessionStore.getState().setSelectedRobot(result.robotId)
    window.location.hash = hashForSiteWorkspace(siteId, 'LiveOps')
  }
  return result
}

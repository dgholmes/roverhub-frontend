import { hashForSiteWorkspace } from '@/app/routes'
import { dataProvider } from '@/lib/realtime/dataProvider'
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
    runTaskNow: (id, steps) => dataProvider.runTaskNow(id, steps),
    makeClip: (robotId, text) => useLiveOpsStore.getState().createSpokenClip(robotId, text),
    robotType: (robotId) => useLiveOpsStore.getState().robots.find((r) => r.robot_id === robotId)?.robot_type ?? null,
  }, task, mission)
  if (result.ok) {
    useSessionStore.getState().setSelectedRobot(result.robotId)
    window.location.hash = hashForSiteWorkspace(siteId, 'LiveOps')
  }
  return result
}

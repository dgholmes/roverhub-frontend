import { useCallback, useEffect, useReducer } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { OPERATOR_ID } from '@/lib/realtime/operator'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { initialRobotRun, reduceRobotRun, robotRunView, type RobotRunInput, type RobotRunState, type RobotRunView } from './robotRun'

type MissionInfo = { name: string; estimateS: number | null }
/** Per run id; a failed getRun is not cached as a result, so the name stays null. */
const missionCache = new Map<string, MissionInfo>()

function fetchMission(runId: string): Promise<MissionInfo | null> {
  const hit = missionCache.get(runId)
  if (hit) return Promise.resolve(hit)
  return dataProvider.getRun(runId).then(
    (d) => {
      const m = d.run.mission
      const info = { name: m.name, estimateS: m.estimates?.duration_bounded ? (m.estimates.duration_s ?? null) : null }
      missionCache.set(runId, info)
      return info
    },
    () => null,
  )
}

export function useRobotRun(robotId: string | null): { view: RobotRunView; dismiss(): void } {
  const [state, dispatch] = useReducer(
    (s: RobotRunState, i: RobotRunInput) => reduceRobotRun(s, i, OPERATOR_ID), initialRobotRun)
  const robot = useLiveOpsStore((s) => (robotId ? s.robots.find((r) => r.robot_id === robotId) : undefined))
  const activeRun = robot?.active_run ?? null
  const owner = robot?.control_owner ?? null

  useEffect(() => {
    if (!robotId) return
    return dataProvider.subscribeRunEvents(robotId, (event) => dispatch({ event }))
  }, [robotId])

  useEffect(() => {
    dispatch({ state: { active_run: activeRun, control_owner: owner } })
  }, [activeRun, owner])

  const wantedRun = activeRun?.run_id ?? null
  useEffect(() => {
    if (!wantedRun) return
    let live = true
    void fetchMission(wantedRun).then((mission) => { if (live && mission) dispatch({ mission }) })
    return () => { live = false }
  }, [wantedRun])

  const dismiss = useCallback(() => dispatch({ dismiss: true }), [])
  return { view: robotRunView(state, OPERATOR_ID), dismiss }
}

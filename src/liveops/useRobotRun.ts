import { useCallback, useEffect, useReducer } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { currentOperatorId, useOperatorId } from '@/lib/realtime/operator'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { initialRobotRun, reduceRobotRun, robotRunView, type RobotRunInput, type RobotRunState, type RobotRunView, type RunMissionInfo } from './robotRun'

type MissionInfo = RunMissionInfo
/** Per run id; a failed getRun is not cached as a result, so the name stays null. */
const missionCache = new Map<string, MissionInfo>()

function fetchMission(runId: string): Promise<MissionInfo | null> {
  const hit = missionCache.get(runId)
  if (hit) return Promise.resolve(hit)
  return dataProvider.getRun(runId).then(
    (d) => {
      const m = d.run.mission
      const info: MissionInfo = {
        name: m.name, estimateS: m.estimates?.duration_bounded ? (m.estimates.duration_s ?? null) : null,
        // A route's waypoints, for its progress on the LiveOps map (routeProgress.ts).
        kind: m.kind, mapId: m.map_id,
        ...(m.kind === 'route' ? { waypoints: m.waypoints.map((w) => ({ waypoint_id: w.waypoint_id, label: w.label, x_m: w.x_m, y_m: w.y_m })) } : {}),
      }
      missionCache.set(runId, info)
      return info
    },
    () => null,
  )
}

export function useRobotRun(robotId: string | null): { view: RobotRunView; dismiss(): void } {
  // State is tagged with the robot it belongs to, so switching robots never shows the old one's run.
  const [tagged, dispatch] = useReducer(
    (s: { forRobot: string | null; run: RobotRunState }, i: RobotRunInput & { forRobot?: string | null }) =>
      i.reset ? { forRobot: i.forRobot ?? null, run: initialRobotRun } : { ...s, run: reduceRobotRun(s.run, i, currentOperatorId()) },
    { forRobot: robotId, run: initialRobotRun })
  const state = tagged.forRobot === robotId ? tagged.run : initialRobotRun
  useEffect(() => { dispatch({ reset: true, forRobot: robotId }) }, [robotId])
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

  const operatorId = useOperatorId()
  const dismiss = useCallback(() => dispatch({ dismiss: true }), [])
  return { view: robotRunView(state, operatorId), dismiss }
}

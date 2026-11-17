import { useEffect, useMemo, useReducer, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { currentNavPath, NAV_PATH_STALE_MS, type NavPathSample, type NavPathView } from '@/liveops/navPath'
import type { NavGoalStatus } from '@/types/robotState'

/**
 * The route Nav2 is planning for the walk on screen (nav/path, schema 0.0.24),
 * outside any map library: NavGoalLayer hands it to the flat map's markers and
 * to LiveScene. Null keeps today's dashed line (see currentNavPath).
 *
 * `robotId` null subscribes to nothing (the map is off: the mini inset, a
 * floor with no survey). Re-evaluated when the latest sample turns stale, so a
 * robot that stops sending falls back to the dashed line on its own.
 */
export function useNavPath(
  robotId: string | null, goal: Pick<NavGoalStatus, 'goal_id'> | null, mapId: string | null | undefined,
): NavPathView | null {
  const [latest, setLatest] = useState<{ robotId: string; sample: NavPathSample } | null>(null)
  useEffect(() => {
    if (!robotId) return
    return dataProvider.subscribeNavPath(robotId, (sample) => setLatest({ robotId, sample }))
  }, [robotId])
  const sample = latest && latest.robotId === robotId ? latest.sample : null

  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!sample) return
    const left = NAV_PATH_STALE_MS - (Date.now() - sample.receivedAt)
    if (left <= 0) return
    const id = setTimeout(tick, left + 1)
    return () => clearTimeout(id)
  }, [sample])

  // One object per sample, goal and map (and staleness), so a telemetry frame
  // hands the 3D scene the same path and it rebuilds nothing.
  const now = Date.now()
  const fresh = !!sample && now - sample.receivedAt < NAV_PATH_STALE_MS
  const goalId = goal?.goal_id ?? null
  return useMemo(
    () => (fresh && goalId ? currentNavPath(sample, { goal_id: goalId }, mapId, sample!.receivedAt) : null),
    [sample, fresh, goalId, mapId],
  )
}

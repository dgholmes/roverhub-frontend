import { useMemo } from 'react'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import { robotsForSite } from './siteRobots'

/** The robots at the site being viewed. Every site workspace (LiveOps, Fleet,
 * Missions, Data) reads robots through this, never the whole fleet; the org
 * pages use useOrgSites instead. */
export function useSiteRobots(): RobotState[] {
  const siteId = useSessionStore((s) => s.activeSiteId)
  const robots = useLiveOpsStore((s) => s.robots)
  return useMemo(() => robotsForSite(robots, siteId), [robots, siteId])
}

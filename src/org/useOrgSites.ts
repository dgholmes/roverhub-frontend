import { useMemo } from 'react'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { robotAttention, bySeverity, type Attention } from '@/fleet/attention'
import { reachabilityOf } from '@/lib/connectivityHealth'
import type { RobotState } from '@/types'
import { mergeSites, type OrgSite } from './sites'

export interface SiteSummary extends OrgSite {
  robots: RobotState[]
  online: number
  /** Robots with a problem, worst first. */
  attention: { robot: RobotState; attention: Attention }[]
  missionsRunning: number
}

/** Every known site with its live robots and problems — the shared input to
 * the Dashboard and the Sites page. */
export function useOrgSites(): SiteSummary[] {
  const sites = useSessionStore((s) => s.sites)
  const robots = useLiveOpsStore((s) => s.robots)
  const missions = useLiveOpsStore((s) => s.missions)
  return useMemo(() => mergeSites(sites, robots).map((site) => {
    const here = robots.filter((r) => r.site_id === site.id)
    const attention = here
      .map((robot) => ({ robot, attention: robotAttention(robot) }))
      .filter((x): x is { robot: RobotState; attention: Attention } => x.attention !== null)
      .sort((a, b) => bySeverity(a.attention, b.attention))
    return {
      ...site,
      robots: here,
      online: here.filter((r) => reachabilityOf(r) === 'online').length,
      attention,
      missionsRunning: here.filter((r) => missions[r.robot_id]?.status === 'active').length,
    }
  }), [sites, robots, missions])
}

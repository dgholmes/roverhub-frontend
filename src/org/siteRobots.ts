import type { RobotState } from '@/types'

/**
 * The robots that belong to one site: the ones whose bridge reports that
 * site id. A robot's site comes from its bridge's SITE_ID setting, so this is
 * the only membership there is until sites are stored on the backend.
 */
export function robotsForSite<T extends Pick<RobotState, 'site_id'>>(robots: T[], siteId: string): T[] {
  return robots.filter((r) => r.site_id === siteId)
}

/** Sites, other than `siteId`, that have robots reporting to them, with how
 * many. Used to point someone at the right site when theirs is empty. */
export function otherSitesWithRobots(robots: Pick<RobotState, 'site_id'>[], siteId: string): { siteId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of robots) {
    if (r.site_id === siteId || !r.site_id || r.site_id === 'unknown') continue
    counts.set(r.site_id, (counts.get(r.site_id) ?? 0) + 1)
  }
  return [...counts].map(([id, count]) => ({ siteId: id, count })).sort((a, b) => a.siteId.localeCompare(b.siteId))
}

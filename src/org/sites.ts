import type { RobotState } from '@/types'
import type { Site } from '@/store/useSessionStore'

export interface OrgSite extends Site {
  /** True when the site is known only because a robot's bridge registered
   * into it, not because anyone created it here. Real deployments name their
   * site in each bridge's config, and there is no site store to create it in,
   * so without this those sites would never appear in the console. */
  discovered: boolean
}

/**
 * Every site the console knows about: the ones in the session (created here,
 * or the built-in seed) plus any site a robot reports that isn't among them.
 * Order: known sites as listed, then discovered ones by id.
 */
export function mergeSites(sites: Site[], robots: Pick<RobotState, 'site_id'>[]): OrgSite[] {
  const known = new Set(sites.map((s) => s.id))
  const discovered = [...new Set(robots.map((r) => r.site_id))]
    .filter((id) => id && id !== 'unknown' && !known.has(id))
    .sort()
    .map((id) => ({ id, name: id, discovered: true }))
  return [...sites.map((s) => ({ ...s, discovered: false })), ...discovered]
}

/** "14:02" in the site's timezone, or null when it has none or it is invalid. */
export function siteLocalTime(timezone: string | undefined, now = new Date()): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(now)
  } catch {
    return null
  }
}

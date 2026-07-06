import { OrgComingSoon } from '../OrgComingSoon'

/** Cross-site rollup (docs/01-prd.md §6.4) — explicitly last-to-build per the
 * roadmap, since the PRD buckets cross-site analytics as R2/Future. */
export function OrgDashboardPage() {
  return (
    <OrgComingSoon
      title="Organization Dashboard"
      description="Cross-site rollup: fleet health, active missions, alerts, and analytics across every site in this organization."
    />
  )
}

import type { OrgRole, SiteRole } from './roles'

/**
 * The Organization Console's own view types.
 *
 * ⚠️ These lived in `src/mocks/mockOrg.ts`, so every production module that
 * needed one imported from `@/mocks` — which is indistinguishable, to a reader
 * and to a lint rule, from importing demo *data*. A type is not demo data: it
 * is the shape both the mock and a future real source have to satisfy, so it
 * belongs with the domain. Audit 2026-11-18 §8.6.
 *
 * Nothing here has a backend yet: history needs the database and members need
 * sign-in to be on. `org/orgData.ts` is where that switch lives.
 */

/** One day's value in a history series, `day` as `YYYY-MM-DD`. */
export interface DailyCount { day: string; value: number }

export interface OrgHistory {
  /** Fleet availability per day, 0–100. */
  uptimePct: DailyCount[]
  patrols: DailyCount[]
  alerts: DailyCount[]
  distanceKm: DailyCount[]
  falls: DailyCount[]
}

export interface Member {
  id: string
  name: string
  email: string
  orgRole: OrgRole
  /** site id -> role there. A site missing here means no access. */
  siteRoles: Record<string, SiteRole>
  mfa: boolean
  auditAccess: boolean
  lastActive: string
}

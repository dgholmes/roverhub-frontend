export const WORKSPACES = ['LiveOps', 'Fleet', 'Missions', 'Data', 'Systems'] as const
export type Workspace = typeof WORKSPACES[number]

export const ORG_PAGES = ['Dashboard', 'Sites', 'Team', 'Devices', 'Settings'] as const
export type OrgPage = typeof ORG_PAGES[number]

export type AppRoute =
  | { kind: 'org'; page: OrgPage }
  | { kind: 'site'; siteId: string; workspace: Workspace }
  /** A hash that matched no route. Distinct from the org dashboard so the UI
   * can say so instead of silently rendering something else. */
  | { kind: 'notFound'; hash: string }

const WORKSPACE_SLUG: Record<Workspace, string> = {
  LiveOps: 'liveops', Fleet: 'fleet', Missions: 'missions', Data: 'data', Systems: 'systems',
}
const SLUG_TO_WORKSPACE: Record<string, Workspace> = Object.fromEntries(
  Object.entries(WORKSPACE_SLUG).map(([workspace, slug]) => [slug, workspace]),
) as Record<string, Workspace>

const ORG_PAGE_SLUG: Record<OrgPage, string> = {
  Dashboard: 'dashboard', Sites: 'sites', Team: 'team', Devices: 'devices', Settings: 'settings',
}
const SLUG_TO_ORG_PAGE: Record<string, OrgPage> = Object.fromEntries(
  Object.entries(ORG_PAGE_SLUG).map(([page, slug]) => [slug, page]),
) as Record<string, OrgPage>

/**
 * Nested routing: #/org/{page} for the Organization Console, #/site/{siteId}/
 * {workspace} for a site's LiveOps/Fleet/Missions/Data/Systems (docs/01-prd.md
 * §6.4, OD-8 roadmap).
 *
 * An empty hash means "no destination chosen yet" and resolves to Sites, which
 * is where an operator actually picks one. It used to resolve to the Org
 * Dashboard — a "Coming soon." placeholder — making the emptiest screen in the
 * app both the first thing a new user saw and the landing spot for every typo.
 *
 * An unrecognised hash is now `notFound` rather than silently becoming the
 * dashboard: previously the hash, the highlighted nav item and the rendered
 * content could all disagree, and a refresh reproduced it.
 * docs/audit/2026-08-12-ui-ux-audit.md A-33.
 */
export function parseRoute(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, '')
  if (normalized === '') return { kind: 'org', page: 'Sites' }

  const orgMatch = hash.match(/^#\/org\/([^/]+)/)
  if (orgMatch) {
    const page = SLUG_TO_ORG_PAGE[orgMatch[1]]
    if (page) return { kind: 'org', page }
    return { kind: 'notFound', hash }
  }

  const siteMatch = hash.match(/^#\/site\/([^/]+)\/([^/]+)/)
  if (siteMatch) {
    const workspace = SLUG_TO_WORKSPACE[siteMatch[2]]
    if (workspace) return { kind: 'site', siteId: decodeURIComponent(siteMatch[1]), workspace }
    return { kind: 'notFound', hash }
  }

  return { kind: 'notFound', hash }
}

export function hashForOrgPage(page: OrgPage): string {
  return `#/org/${ORG_PAGE_SLUG[page]}`
}

export function hashForSiteWorkspace(siteId: string, workspace: Workspace): string {
  return `#/site/${encodeURIComponent(siteId)}/${WORKSPACE_SLUG[workspace]}`
}

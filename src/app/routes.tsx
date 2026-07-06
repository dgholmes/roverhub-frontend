export const WORKSPACES = ['LiveOps', 'Fleet', 'Missions', 'Data', 'Systems'] as const
export type Workspace = typeof WORKSPACES[number]

export const ORG_PAGES = ['Dashboard', 'Sites', 'Team', 'Devices', 'Settings'] as const
export type OrgPage = typeof ORG_PAGES[number]

export type AppRoute =
  | { kind: 'org'; page: OrgPage }
  | { kind: 'site'; siteId: string; workspace: Workspace }

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
 * §6.4, OD-8 roadmap). Root/unrecognized hashes land on the Organization
 * Dashboard — operators choose a site from there, mirroring the
 * org-then-project flow this was modeled on.
 */
export function parseRoute(hash: string): AppRoute {
  const orgMatch = hash.match(/^#\/org\/([^/]+)/)
  if (orgMatch) {
    const page = SLUG_TO_ORG_PAGE[orgMatch[1]]
    if (page) return { kind: 'org', page }
  }

  const siteMatch = hash.match(/^#\/site\/([^/]+)\/([^/]+)/)
  if (siteMatch) {
    const workspace = SLUG_TO_WORKSPACE[siteMatch[2]]
    if (workspace) return { kind: 'site', siteId: decodeURIComponent(siteMatch[1]), workspace }
  }

  return { kind: 'org', page: 'Dashboard' }
}

export function hashForOrgPage(page: OrgPage): string {
  return `#/org/${ORG_PAGE_SLUG[page]}`
}

export function hashForSiteWorkspace(siteId: string, workspace: Workspace): string {
  return `#/site/${encodeURIComponent(siteId)}/${WORKSPACE_SLUG[workspace]}`
}

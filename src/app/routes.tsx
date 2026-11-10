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
 * An empty hash means "no destination chosen yet" and resolves to the Org
 * Dashboard, which says what needs attention across every site and links
 * into each. It pointed at Sites while the Dashboard was a "Coming soon."
 * placeholder, which made the emptiest screen the first thing a user saw.
 *
 * An unrecognised hash is now `notFound` rather than silently becoming the
 * dashboard: previously the hash, the highlighted nav item and the rendered
 * content could all disagree, and a refresh reproduced it.
 * docs/audit/2026-08-12-ui-ux-audit.md A-33.
 */
export function parseRoute(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, '')
  if (normalized === '') return { kind: 'org', page: 'Dashboard' }

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

/** A run's page in Data › Missions: `#/site/{siteId}/data/missions/{runId}`.
 * parseRoute reads the site and workspace from the front and ignores the rest. */
export function hashForSiteRun(siteId: string, runId: string): string {
  return `${hashForSiteWorkspace(siteId, 'Data')}/missions/${encodeURIComponent(runId)}`
}

/** The run a Data hash opens, if it names one. */
export function runIdFromHash(hash: string): string | null {
  const m = hash.match(/^#\/site\/[^/]+\/data\/missions\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** The Maps view of Missions, where a surveyed map is curated before missions
 * are planned on it: `#/site/{siteId}/missions/maps`. parseRoute reads the site
 * and workspace from the front, so this is still the Missions workspace. */
export function hashForMissionsMaps(siteId: string): string {
  return `${hashForSiteWorkspace(siteId, 'Missions')}/maps`
}

export function isMissionsMapsHash(hash: string): boolean {
  return /^#\/site\/[^/]+\/missions\/maps(?:[/?#]|$)/.test(hash)
}

/** The views of Missions › Schedule. Runs is the default and has no suffix. */
export const SCHEDULE_VIEWS = ['runs', 'tasks', 'calendar'] as const
export type ScheduleView = typeof SCHEDULE_VIEWS[number]

/** The Schedule view of Missions: `#/site/{siteId}/missions/schedule`, with
 * `/tasks` or `/calendar` for those views. Like Maps, parseRoute reads the
 * site and workspace from the front, so this is still the Missions workspace. */
export function hashForMissionsSchedule(siteId: string, view: ScheduleView = 'runs'): string {
  const base = `${hashForSiteWorkspace(siteId, 'Missions')}/schedule`
  return view === 'runs' ? base : `${base}/${view}`
}

/** Which Schedule view a hash names, or null when it is not a Schedule hash.
 * A view this build does not know opens the default. */
export function scheduleViewFromHash(hash: string): ScheduleView | null {
  const m = hash.match(/^#\/site\/[^/]+\/missions\/schedule(?:\/([^/?#]*))?(?:[/?#]|$)/)
  if (!m) return null
  return (SCHEDULE_VIEWS as readonly string[]).includes(m[1] ?? '') ? m[1] as ScheduleView : 'runs'
}

/** The mission editor's tabs, as they appear in a hash (mirrors EditorTab in
 * missions/authoring.ts, which the editor narrows per mission kind). */
const EDITOR_TABS = ['route', 'program', 'announcements', 'settings'] as const
export type EditorTabSlug = typeof EDITOR_TABS[number]

/** A mission open in the editor: `#/site/{siteId}/missions/edit/{missionId}`,
 * optionally with `/{tab}`, so a reload or a shared link reopens it. */
export function hashForMissionEditor(siteId: string, missionId: string, tab?: EditorTabSlug): string {
  const base = `${hashForSiteWorkspace(siteId, 'Missions')}/edit/${encodeURIComponent(missionId)}`
  return tab ? `${base}/${tab}` : base
}

/** The mission (and tab) a hash opens in the editor, if it names one. An
 * unknown tab reads as none, so the editor starts on its own first tab. */
export function missionEditorFromHash(hash: string): { missionId: string; tab: EditorTabSlug | null } | null {
  const m = hash.match(/^#\/site\/[^/]+\/missions\/edit\/([^/?#]+)(?:\/([^/?#]*))?/)
  if (!m) return null
  const tab = (EDITOR_TABS as readonly string[]).includes(m[2] ?? '') ? m[2] as EditorTabSlug : null
  return { missionId: decodeURIComponent(m[1]), tab }
}

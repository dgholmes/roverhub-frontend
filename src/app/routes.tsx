export const WORKSPACES = ['LiveOps', 'Fleet', 'Map', 'Missions', 'Data', 'Systems'] as const
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
  LiveOps: 'liveops', Fleet: 'fleet', Map: 'map', Missions: 'missions', Data: 'data', Systems: 'systems',
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

  const siteMatch = hash.match(/^#\/site\/([^/]+)\/([^/?#]+)/)
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

/** A survey's replay in Data › Surveys: `#/site/{siteId}/data/surveys/{surveyId}`.
 * Like a run link, parseRoute reads only the site and workspace from the front. */
export function hashForSiteSurvey(siteId: string, surveyId: string): string {
  return `${hashForSiteWorkspace(siteId, 'Data')}/surveys/${encodeURIComponent(surveyId)}`
}

/** The survey a Data hash opens, if it names one. */
export function surveyIdFromHash(hash: string): string | null {
  const m = hash.match(/^#\/site\/[^/]+\/data\/surveys\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** The panel tabs of the Map workspace, in the order the page offers them.
 * Setup is last: it is reached from the header's Ready chip, and is where a
 * draft map opens (docs/superpowers/specs/2026-11-26-map-workspace-and-sites-design.md §1). */
export const MAP_TABS = ['overview', 'zones', 'quality', 'versions', 'setup'] as const
export type MapTab = typeof MAP_TABS[number]

/** The Map workspace: `#/site/{siteId}/map` (on the map `pickSiteMap` chooses)
 * or `#/site/{siteId}/map/{mapId}` (that map selected), optionally with
 * `?tab=` naming a panel tab. Replaced Missions › Maps on 2026-11-26. */
export function hashForMap(siteId: string, mapId?: string | null, tab?: MapTab | null): string {
  const base = hashForSiteWorkspace(siteId, 'Map')
  if (!mapId) return base
  const withMap = `${base}/${encodeURIComponent(mapId)}`
  return tab ? `${withMap}?tab=${tab}` : withMap
}

/** A map in the full-width editor: `#/site/{siteId}/map/{mapId}/edit`. Where a
 * finished survey links to, so the draft opens ready to clean up. */
export function hashForMapEditor(siteId: string, mapId: string): string {
  return `${hashForMap(siteId, mapId)}/edit`
}

/** Map › Survey with a robot: `#/site/{siteId}/map/survey`, optionally
 * `/{robotId}` to open on that robot. */
export function hashForMapSurvey(siteId: string, robotId?: string | null): string {
  const base = `${hashForSiteWorkspace(siteId, 'Map')}/survey`
  return robotId ? `${base}/${encodeURIComponent(robotId)}` : base
}

/** What a Map workspace hash opens: the page (with the map and tab it names,
 * if any), a map in the editor, or the Survey page. Null for any other hash.
 * An unknown tab reads as none, so the page picks its own default. */
export type MapRoute =
  | { view: 'page'; mapId: string | null; tab: MapTab | null }
  | { view: 'edit'; mapId: string }
  | { view: 'survey'; robotId: string | null }

export function mapRouteFromHash(hash: string): MapRoute | null {
  const m = hash.match(/^#\/site\/[^/]+\/map(?:\/([^?#]*))?(?:\?([^#]*))?$/)
  if (!m) return null
  const parts = (m[1] ?? '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'survey') return { view: 'survey', robotId: parts[1] ?? null }
  if (parts.length >= 2 && parts[1] === 'edit') return { view: 'edit', mapId: parts[0] }
  const tabRaw = new URLSearchParams(m[2] ?? '').get('tab')
  const tab = (MAP_TABS as readonly string[]).includes(tabRaw ?? '') ? tabRaw as MapTab : null
  return { view: 'page', mapId: parts[0] ?? null, tab }
}

/** Where an old Missions › Maps link now lives, or null when the hash is not
 * one. `/missions/maps`, `/maps/view/{id}`, `/maps/edit/{id}` and
 * `/maps/survey[/{robot}]` keep working: AppShell replaces them in place on
 * load and on hashchange. */
export function legacyMapsRedirect(hash: string): string | null {
  const m = hash.match(/^#\/site\/([^/]+)\/missions\/maps(?:\/([^?#]*))?(?:[?#].*)?$/)
  if (!m) return null
  const siteId = decodeURIComponent(m[1])
  const parts = (m[2] ?? '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'survey') return hashForMapSurvey(siteId, parts[1] ?? null)
  if (parts[0] === 'edit' && parts[1]) return hashForMapEditor(siteId, parts[1])
  if (parts[0] === 'view' && parts[1]) return hashForMap(siteId, parts[1])
  return hashForMap(siteId)
}

/** The views of Missions › Schedule, in the order the page offers them. Tasks
 * is the default, because it is the one with Run now on it (2026-11-25: Runs
 * was the default, and listed a mission's runs with no way to start one). */
export const SCHEDULE_VIEWS = ['tasks', 'runs', 'calendar'] as const
export type ScheduleView = typeof SCHEDULE_VIEWS[number]

/** The Schedule view of Missions: `#/site/{siteId}/missions/schedule` for
 * Tasks, with `/runs` or `/calendar` for those views. `/tasks` is still read,
 * so links made before Tasks became the default keep working. Like Maps,
 * parseRoute reads the site and workspace from the front, so this is still the
 * Missions workspace. */
export function hashForMissionsSchedule(siteId: string, view: ScheduleView = 'tasks'): string {
  const base = `${hashForSiteWorkspace(siteId, 'Missions')}/schedule`
  return view === 'tasks' ? base : `${base}/${view}`
}

/** Which Schedule view a hash names, or null when it is not a Schedule hash.
 * A view this build does not know opens the default. */
export function scheduleViewFromHash(hash: string): ScheduleView | null {
  const m = hash.match(/^#\/site\/[^/]+\/missions\/schedule(?:\/([^/?#]*))?(?:[/?#]|$)/)
  if (!m) return null
  return (SCHEDULE_VIEWS as readonly string[]).includes(m[1] ?? '') ? m[1] as ScheduleView : 'tasks'
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

/** The pages of Systems: Logs, and Sensors (the lidar mount, schema 0.0.23).
 * The rest of docs/05-ui-ux.md §13 is not shown until it exists. */
export const SYSTEMS_PAGES = ['logs', 'sensors'] as const
export type SystemsPage = typeof SYSTEMS_PAGES[number]

/** A Systems page: `#/site/{siteId}/systems/logs`. Like Maps, parseRoute reads
 * the site and workspace from the front, so this is still Systems. */
export function hashForSystemsPage(siteId: string, page: SystemsPage = 'logs'): string {
  return `${hashForSiteWorkspace(siteId, 'Systems')}/${page}`
}

/** Which Systems page a hash names. The bare workspace hash, and a page this
 * build does not know, open Logs. */
export function systemsPageFromHash(hash: string): SystemsPage {
  const m = hash.match(/^#\/site\/[^/]+\/systems\/([^/?#]*)/)
  return (SYSTEMS_PAGES as readonly string[]).includes(m?.[1] ?? '') ? m![1] as SystemsPage : 'logs'
}

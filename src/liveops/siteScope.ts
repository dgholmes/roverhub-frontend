/**
 * Restricting a workspace's data to the site named in the route.
 *
 * `SiteShell` set `activeSiteId` from the URL, and exactly one place in the app
 * ever read it (to build a link). No workspace filtered by it: LiveOps took
 * every robot from the store, `FleetTable` treated `site_id` as a *display
 * column* and a sort key rather than a filter, and docks, bridges and missions
 * were rendered wholesale. So `#/site/atlantis/fleet` — a site that does not
 * exist — rendered a fully-populated North Yard fleet underneath it.
 *
 * That makes the routing hierarchy a lie: the URL claims a scope the data does
 * not honour. In multi-site operation it is also the setup for acting on the
 * wrong site's robot, which is why this is scoping and not cosmetics.
 * docs/audit/2026-08-12-ui-ux-audit.md A-34.
 */

/**
 * Records belonging to `siteId`.
 *
 * `undefined` means "no site filter" and spans everything — matching
 * `VITE_SITE_ID`'s existing semantics, which a single-site deployment relies
 * on. A site id that simply matches nothing yields nothing; it must never fall
 * back to returning everything, because that is the behaviour this replaces.
 */
export function scopeToSite<T extends { site_id: string }>(
  records: T[],
  siteId: string | undefined,
): T[] {
  if (siteId === undefined) return records
  return records.filter((r) => r.site_id === siteId)
}

/** Whether the route names a site the session knows about. `undefined` is the
 * deliberate no-filter case and is known; an unrecognised id is not, and the
 * caller should say so rather than render a neighbouring site's data. */
export function isKnownSite(sites: { id: string }[], siteId: string | undefined): boolean {
  if (siteId === undefined) return true
  return sites.some((s) => s.id === siteId)
}

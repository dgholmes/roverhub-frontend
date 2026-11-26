import { ApiError } from '@/lib/realtime/apiError'
import { SITE_ID_PATTERN } from '@/types/commands'
import { MAX_SITE_ADDRESS_CHARS, MAX_SITE_NAME_CHARS, type Site as SiteRecord, type SiteCreate, type SiteLocation } from '@/types/sites'
import type { Site } from '@/store/useSessionStore'

/**
 * Stored sites (GET /sites, spec 2026-11-26 §2) as the console holds them, and
 * the checks the site forms make before the backend makes them again.
 */

/** The console's view of a stored site: `id` where the wire says `site_id`,
 * because every page already reads `site.id`. */
export function siteFromRecord(r: SiteRecord): Site {
  return {
    id: r.site_id,
    name: r.name,
    timezone: r.timezone,
    address: r.address ?? null,
    location: r.location ?? undefined,
    updatedAt: r.updated_at,
  }
}

/** A display name as a site id: "West Depot" -> "site-west-depot". Only a
 * suggestion; the backend derives its own when none is sent. */
export function slugifyToSiteId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `site-${slug || Date.now()}`
}

/** Whether `tz` is an IANA timezone this browser knows. */
export function isTimezone(tz: string): boolean {
  if (!tz.trim()) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** This browser's timezone, to fill a new site's form. */
export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

/** What a site form holds: text as typed. */
export interface SiteFormValues {
  siteId: string
  name: string
  timezone: string
  address: string
  lat: string
  lng: string
}

export type SiteFormError = 'name' | 'nameLong' | 'siteId' | 'timezone' | 'location' | 'addressLong'

/** The form as a body, or the first thing wrong with it. Lat and lng are
 * both given or both empty. An empty address or location is null, which a
 * PATCH reads as "clear it". */
export function parseSiteForm(v: SiteFormValues):
  | { ok: true; body: Required<Omit<SiteCreate, 'site_id'>> & { site_id: string | null } }
  | { ok: false; error: SiteFormError } {
  const name = v.name.trim()
  if (!name) return { ok: false, error: 'name' }
  if (name.length > MAX_SITE_NAME_CHARS) return { ok: false, error: 'nameLong' }
  const siteId = v.siteId.trim()
  if (siteId && !SITE_ID_PATTERN.test(siteId)) return { ok: false, error: 'siteId' }
  const timezone = v.timezone.trim()
  if (!isTimezone(timezone)) return { ok: false, error: 'timezone' }
  const address = v.address.trim()
  if (address.length > MAX_SITE_ADDRESS_CHARS) return { ok: false, error: 'addressLong' }
  let location: SiteLocation | null = null
  if (v.lat.trim() || v.lng.trim()) {
    const lat = Number(v.lat), lng = Number(v.lng)
    if (!v.lat.trim() || !v.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { ok: false, error: 'location' }
    }
    location = { lat, lng }
  }
  return { ok: true, body: { site_id: siteId || null, name, timezone, address: address || null, location } }
}

/** A site as form text, for Edit site. */
export function siteFormOf(site: Pick<Site, 'id' | 'name' | 'timezone' | 'address' | 'location'>): SiteFormValues {
  return {
    siteId: site.id,
    name: site.name,
    timezone: site.timezone ?? '',
    address: site.address ?? '',
    lat: site.location ? String(site.location.lat) : '',
    lng: site.location ? String(site.location.lng) : '',
  }
}

/** Why a site write failed, in the server's words when it sent some.
 *
 * DELETE's 409 says which robots or maps keep the site. The contract says
 * only that "the detail says which", so this reads a sentence, or an object
 * naming `robots` and/or `maps` (lists of ids or names), or a `message`. A
 * 422 whose detail is a list of field errors reads the first one's `msg`. */
export function siteWriteError(e: unknown): { status: number | null; text: string | null; robots: string[]; maps: string[] } {
  if (!(e instanceof ApiError)) return { status: null, text: e instanceof Error ? e.message : null, robots: [], maps: [] }
  const detail = (e.body as { detail?: unknown } | null)?.detail
  const names = (x: unknown): string[] => Array.isArray(x)
    ? x.map((i) => (typeof i === 'string' ? i : (i as { name?: string; robot_id?: string; map_id?: string })?.name
      ?? (i as { robot_id?: string })?.robot_id ?? (i as { map_id?: string })?.map_id ?? '')).filter(Boolean)
    : []
  if (typeof detail === 'string' && detail.trim()) return { status: e.status, text: detail, robots: [], maps: [] }
  if (Array.isArray(detail)) {
    const msg = (detail[0] as { msg?: unknown } | undefined)?.msg
    return { status: e.status, text: typeof msg === 'string' ? msg : null, robots: [], maps: [] }
  }
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: unknown; robots?: unknown; maps?: unknown }
    return {
      status: e.status,
      text: typeof d.message === 'string' && d.message.trim() ? d.message : null,
      robots: names(d.robots),
      maps: names(d.maps),
    }
  }
  return { status: e.status, text: null, robots: [], maps: [] }
}

/** The map to picture a site by: the one most of its robots have loaded
 * (`nav_map_id`), so the robots' dots land on the picture; else its newest
 * active map; else its newest map. The same order as `pickSiteMap`
 * (store/useSiteMapStore.ts), which prefers the selected robot's map, kept
 * here so the org pages need not build LiveOps' map store. A site with two
 * active maps showed the newer one, which no robot was on (2026-11-26). */
export function siteThumbnailMap<T extends { map_id: string; status: string; updated_at: string }>(
  maps: readonly T[],
  robotMapIds: readonly (string | null | undefined)[] = [],
): T | null {
  const counts = new Map<string, number>()
  for (const id of robotMapIds) if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  const byRecency = [...maps].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const carried = byRecency
    .filter((m) => counts.has(m.map_id))
    .sort((a, b) => (counts.get(b.map_id) ?? 0) - (counts.get(a.map_id) ?? 0))[0]
  return carried ?? byRecency.find((m) => m.status === 'active') ?? byRecency[0] ?? null
}

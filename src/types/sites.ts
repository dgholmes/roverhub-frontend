/**
 * Mirrors shared/schemas/sites.py (docs/superpowers/specs/2026-11-26-map-
 * workspace-and-sites-design.md §2). Hand-maintained -- change both together.
 * `src/missions/missionTasks.test.ts` reads that file and fails on drift.
 *
 * REST-only: `GET/POST /sites`, `GET/PATCH/DELETE /sites/{id}`. Nothing on
 * MQTT carries a Site; a robot names its site by id only.
 */

export interface SiteLocation {
  /** -90..90 */
  lat: number
  /** -180..180 */
  lng: number
}

/** A stored site. `site_id` matches `SITE_ID_PATTERN` and never changes. */
export interface Site {
  site_id: string
  /** 1..80 characters, trimmed. */
  name: string
  /** An IANA name, e.g. `Asia/Seoul`. */
  timezone: string
  /** Up to 200 characters. */
  address?: string | null
  location?: SiteLocation | null
  /** ISO time. */
  created_at: string
  updated_at: string
}

/** `POST /sites`. Without `site_id` the backend derives one from the name;
 *  a taken id answers 409. */
export interface SiteCreate {
  site_id?: string | null
  name: string
  timezone: string
  address?: string | null
  location?: SiteLocation | null
}

/** `PATCH /sites/{id}`: only what is given changes. An explicit null clears
 *  `address` or `location`, and is refused (422) for `name` and `timezone`,
 *  which a site always has; `site_id` cannot change. */
export interface SiteUpdate {
  name?: string
  timezone?: string
  address?: string | null
  location?: SiteLocation | null
}

/** The longest name and address the backend stores. */
export const MAX_SITE_NAME_CHARS = 80
export const MAX_SITE_ADDRESS_CHARS = 200

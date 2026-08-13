import { create } from 'zustand'

export type OperatorRole = 'operator' | 'supervisor' | 'engineer' | 'admin'
/** `dualcam` shows this robot's front and back cameras at once; `grid` is the
 * reserved R2 multi-robot patrol wall. Different questions — "what is behind
 * me?" versus "what is the fleet doing?" — so they are separate modes. */
export type ViewMode = 'default' | 'cockpit' | 'split' | 'dualcam' | 'grid'
/** How the camera feed fills its pane. The feed is 4:3 (640x480, fixed by the
 * robot) and the panes are wide, so this is a real trade-off rather than a
 * cosmetic one: 'fit' shows the entire frame with bars at the sides, 'fill'
 * crops the top and bottom away to fill the pane. Defaults to 'fit' because the
 * cropped-away region is the ground ahead, obstacles and the robot's own feet --
 * losing it silently is the worse failure for teleoperation. */
export type CameraFit = 'fit' | 'fill'

export interface Site {
  id: string
  name: string
  timezone?: string
}

interface SessionState {
  /** Single-element today — the product operates as one implicit site
   * ("Site #1"). Real shape now so the future multi-site Org Console
   * (docs/01-prd.md §6.4, OD-8) is a population problem, not a
   * data-modeling problem. */
  sites: Site[]
  activeSiteId: string
  operatorName: string
  /** Auth0 + RBAC is not wired in Phase 1 — single mocked role, honoring the
   * same show/hide rules the real roles would (docs/05-ui-ux.md §18.5).
   * Which role model this maps to is still an open decision (OD-7). */
  role: OperatorRole
  /** null until a robot has actually been discovered. Deliberately NOT seeded
   * with an id: it used to default to the mock `'zaezae-x1-001'`, which matches
   * no real robot, so every consumer fell through to its `?? robots[0]` fallback
   * -- and with two robots publishing telemetry, that displayed robot changed
   * several times a second. `reconcileSelectedRobot` keeps this pointing at a
   * robot that genuinely exists. */
  selectedRobotId: string | null
  viewMode: ViewMode
  /** Camera fill mode, kept in session state so it survives navigating out of
   * LiveOps and back rather than resetting to the default each time. */
  cameraFit: CameraFit
  /** Announcement playback volume, 0-100. Session state rather than per-tab local
   * state so one setting governs every way of producing audio (a stored clip, a
   * typed announcement, a shout) and survives closing the popover. */
  speakVolume: number
  setActiveSite: (siteId: string) => void
  /**
   * Records site ids observed on real robots, so a site the deployment actually
   * uses becomes known even though the seeded registry is mock data.
   *
   * `sites` was hardcoded to `site-north-yard` while a real deployment's robots
   * arrive with `VITE_SITE_ID` (`site-dev`). That mismatch was invisible while
   * nothing filtered by site; with scoping it would render an empty console on
   * a site that has robots. There is no site-registry API to ask, so the robots
   * themselves are the source of truth: a site exists if something is reporting
   * from it. docs/audit/2026-08-12-ui-ux-audit.md A-34.
   */
  registerSites: (siteIds: string[]) => void
  setSelectedRobot: (robotId: string) => void
  setViewMode: (mode: ViewMode) => void
  setCameraFit: (fit: CameraFit) => void
  setSpeakVolume: (volume: number) => void
  /** Keep the selection valid as robots are discovered and disappear.
   *
   * Called on every telemetry update, so it must be a no-op in the steady state
   * -- it returns without calling `set` when the current selection is still
   * present, otherwise a 10Hz telemetry stream would re-render every subscriber
   * continuously.
   *
   * Selects the first robot when nothing is selected (so the UI has something to
   * show as soon as one appears), and re-selects when the current one vanishes
   * from the fleet. Does **not** clear the selection just because a robot goes
   * offline -- an offline robot still has a row, a state and diagnostics worth
   * looking at, and yanking the operator's selection out from under them mid-
   * incident would be worse than showing a robot marked offline. */
  reconcileSelectedRobot: (robotIds: string[]) => void
  /** Org Console > Sites "Create Site" -- mock-only for now (OD-8's real
   * Site/Org CRUD backend is unscheduled future scope; see SitesPage.tsx's
   * own comment). Returns false without adding if `id` collides with an
   * existing site, so callers can surface a validation error. */
  addSite: (site: Site) => boolean
}

/**
 * The site the session starts believing in.
 *
 * Against a real backend this must be the *configured* site, because that is
 * the `site_id` its robots publish under. It used to be the mock
 * `site-north-yard` regardless, which was harmless only while nothing filtered
 * by site — once workspaces are scoped, seeding the wrong id means the operator
 * lands on a site with no robots while two are reporting from another.
 *
 * `registerSites` still fills in anything else the robots report; this only
 * makes the *first* screen correct, before any telemetry has arrived.
 * docs/audit/2026-08-12-ui-ux-audit.md A-34.
 */
const SEEDED_SITES: Site[] = (() => {
  const configured = import.meta.env.VITE_SITE_ID
  if (import.meta.env.VITE_USE_REAL_BACKEND === 'true' && configured) {
    // Named after the id: no display name for a site exists anywhere on the
    // wire, and inventing one would be asserting something we do not know.
    return [{ id: configured, name: configured }]
  }
  return [{ id: 'site-north-yard', name: 'North Yard — Site 1' }]
})()

export const useSessionStore = create<SessionState>((set, get) => ({
  sites: SEEDED_SITES,
  activeSiteId: SEEDED_SITES[0].id,
  operatorName: 'MinJae Joo',
  role: 'operator',
  selectedRobotId: null,
  viewMode: 'default',
  cameraFit: 'fit',
  speakVolume: 100,
  setActiveSite: (siteId) => set({ activeSiteId: siteId }),

  registerSites: (siteIds) => {
    const { sites } = get()
    const known = new Set(sites.map((s) => s.id))
    const additions = [...new Set(siteIds)].filter((id) => id !== '' && !known.has(id))
    // Same array identity when nothing is new — this runs on every telemetry
    // frame, and a fresh array each time would re-render every site consumer.
    if (additions.length === 0) return
    set({
      sites: [
        ...sites,
        // Named after the id: no display name exists on the wire, and inventing
        // a friendly one would be fabricating data about the deployment.
        ...additions.map((id) => ({ id, name: id })),
      ],
    })
  },
  setSelectedRobot: (robotId) => set({ selectedRobotId: robotId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setCameraFit: (fit) => set({ cameraFit: fit }),
  // Clamped here so no caller can push the robot's audio out of range.
  setSpeakVolume: (volume) => set({ speakVolume: Math.max(0, Math.min(100, Math.round(volume))) }),
  reconcileSelectedRobot: (robotIds) => {
    const current = get().selectedRobotId
    // Steady state: selection still valid, change nothing. Must stay a no-op or
    // this re-renders every subscriber on each telemetry frame.
    if (current !== null && robotIds.includes(current)) return
    if (robotIds.length === 0) {
      if (current !== null) set({ selectedRobotId: null })
      return
    }
    set({ selectedRobotId: robotIds[0] })
  },
  addSite: (site) => {
    if (get().sites.some((s) => s.id === site.id)) return false
    set((state) => ({ sites: [...state.sites, site] }))
    return true
  },
}))

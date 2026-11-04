import { create } from 'zustand'
import { USE_REAL_BACKEND } from '@/lib/realtime/dataProvider'
import { mockExtraSites, mockNorthYardLocation } from '@/mocks/mockOrg'
import { SITE_ROLE_IDS, type SiteRole } from '@/org/roles'

const ROLE_KEY = 'rh.rolePreview'
const ROBOT_KEY = 'rh.selectedRobot'

/** How long an explicitly chosen robot (from `?robot=`, a reload, Run now, a
 * click) is kept while it has not been discovered yet, counted from the first
 * telemetry frame that names any robot. Robots arrive one retained registration
 * at a time, so the first frames can hold only some of them; before this, a
 * reload on rover-jetson landed on rover-pi because rover-pi's registration
 * happened to arrive first. */
export const DISCOVERY_GRACE_MS = 10_000

/** The robot to start on: `?robot=` in the URL, then the one this tab had
 * selected before a reload (sessionStorage), then none. */
export function initialSelectedRobot(search: string, stored: string | null): string | null {
  return new URLSearchParams(search).get('robot') || stored || null
}

/** `search` with `robot=` set to `robotId`, keeping every other parameter, so
 * a reload (or a navigation that only changes the hash, as Run now does)
 * comes back on the same robot. */
export function searchWithRobot(search: string, robotId: string): string {
  const params = new URLSearchParams(search)
  params.set('robot', robotId)
  return `?${params.toString()}`
}

function storedRobot(): string | null {
  try { return sessionStorage.getItem(ROBOT_KEY) } catch { return null }
}

/** Reflect the selection in the URL and this tab's sessionStorage, without
 * navigating. Per-viewer convenience: every failure is swallowed. */
function persistSelectedRobot(robotId: string): void {
  try { sessionStorage.setItem(ROBOT_KEY, robotId) } catch { /* convenience only */ }
  try {
    const { search, pathname, hash } = window.location
    if (new URLSearchParams(search).get('robot') === robotId) return
    window.history.replaceState(window.history.state, '', `${pathname}${searchWithRobot(search, robotId)}${hash}`)
  } catch { /* convenience only */ }
}

/** The role the console shows itself as, until sign-in exists. Per browser;
 * defaults to Supervisor (the sample user's role at North Yard). */
function initialRole(): SiteRole {
  try {
    const v = localStorage.getItem(ROLE_KEY)
    if (v && (SITE_ROLE_IDS as readonly string[]).includes(v)) return v as SiteRole
  } catch { /* per-viewer convenience only */ }
  return 'supervisor'
}
/** `cockpit` is camera-first (the camera fills the view, the map is an inset).
 * `map` is map-first, FlightHub-style: the map fills the view and the camera
 * docks in a corner. `dualcam` shows this robot's front and back cameras at
 * once; `grid` shows up to four robots' cameras for patrols. Different questions
 * — "what is behind me?" versus "what is the fleet doing?" — so they are
 * separate modes. */
export type ViewMode = 'cockpit' | 'map' | 'split' | 'dualcam' | 'grid'

const SELECTABLE_VIEW_MODES: readonly ViewMode[] = ['cockpit', 'map', 'split', 'dualcam', 'grid']

/** Names the camera-first view had before it became Cockpit (`default`,
 * `camera`), kept so old review links and VITE_DEFAULT_VIEW values still land
 * on it. The previous Cockpit — map-led, rail hidden — was retired in its
 * favour, so `cockpit` itself needs no alias. */
const VIEW_MODE_ALIASES: Record<string, ViewMode> = { default: 'cockpit', camera: 'cockpit' }

/** Which view LiveOps opens on: `?view=` in the URL, then the build's
 * VITE_DEFAULT_VIEW, then camera-first. Lets a review link open straight on a
 * given layout. Unknown values fall through rather than producing a blank view. */
export function initialViewMode(search: string, buildDefault: string | undefined): ViewMode {
  const candidates = [new URLSearchParams(search).get('view'), buildDefault]
  for (const c of candidates) {
    const mode = c ? (VIEW_MODE_ALIASES[c] ?? c) : null
    if (mode && (SELECTABLE_VIEW_MODES as readonly string[]).includes(mode)) return mode as ViewMode
  }
  return 'cockpit'
}
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
  /** Where the site is, for the Dashboard's site map. Optional: the PRD's
   * geodetic anchor isn't filled until R2, so real sites have none yet. */
  location?: { lat: number; lng: number }
}

/** The built-in site every deployment starts with. Against mock data it gets
 * a location and two sample neighbours (mocks/mockOrg.ts) so the org pages
 * have something to show; a real deployment gets only this one, plus any site
 * its robots report (org/sites.ts mergeSites). */
const NORTH_YARD: Site = { id: 'site-north-yard', name: 'North Yard — Site 1', timezone: 'Asia/Seoul' }
const INITIAL_SITES: Site[] = USE_REAL_BACKEND
  ? [NORTH_YARD]
  : [{ ...NORTH_YARD, location: mockNorthYardLocation }, ...mockExtraSites]

interface SessionState {
  /** Single-element today — the product operates as one implicit site
   * ("Site #1"). Real shape now so the future multi-site Org Console
   * (docs/01-prd.md §6.4, OD-8) is a population problem, not a
   * data-modeling problem. */
  sites: Site[]
  activeSiteId: string
  operatorName: string
  /** The site role the console shows and hides things for (OD-7's model,
   * src/org/roles.ts). There is no sign-in, so it is picked by hand under
   * Settings > Your preferences and enforces nothing; once accounts exist it
   * comes from the signed-in user's role at this site. */
  role: SiteRole
  setRole: (role: SiteRole) => void
  /** null until a robot has actually been discovered. Deliberately NOT seeded
   * with an id: it used to default to the mock `'zaezae-x1-001'`, which matches
   * no real robot, so every consumer fell through to its `?? robots[0]` fallback
   * -- and with two robots publishing telemetry, that displayed robot changed
   * several times a second. `reconcileSelectedRobot` keeps this pointing at a
   * robot that genuinely exists. */
  selectedRobotId: string | null
  /** True while `selectedRobotId` was chosen explicitly (URL, reload, Run now,
   * a click) and that robot has not been seen in the fleet yet. Reconciliation
   * leaves such a choice alone for `DISCOVERY_GRACE_MS` instead of replacing
   * it with whichever robot was discovered first. */
  selectionPending: boolean
  /** When reconciliation first saw a non-empty fleet without the pending robot
   * in it -- the start of its grace period. null until then. */
  pendingDiscoveryStartedAt: number | null
  /** Every robot id reconciliation has seen in this session, so picking a
   * robot that is already known is not treated as pending. Grows only when a
   * new robot appears, never on a steady-state frame. */
  seenRobotIds: string[]
  viewMode: ViewMode
  /** Camera fill mode, kept in session state so it survives navigating out of
   * LiveOps and back rather than resetting to the default each time. */
  cameraFit: CameraFit
  /** Announcement playback volume, 0-100. Session state rather than per-tab local
   * state so one setting governs every way of producing audio (a stored clip, a
   * typed announcement, a shout) and survives closing the popover. */
  speakVolume: number
  setActiveSite: (siteId: string) => void
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
   * incident would be worse than showing a robot marked offline.
   *
   * An explicit choice whose robot has not been seen yet (`selectionPending`)
   * is kept through an empty fleet, and through a fleet without it for
   * `DISCOVERY_GRACE_MS` after the first robot shows up; only then does it fall
   * back. `now` is injectable for tests. */
  reconcileSelectedRobot: (robotIds: string[], now?: number) => void
  /** Org Console > Sites "Create Site" -- mock-only for now (OD-8's real
   * Site/Org CRUD backend is unscheduled future scope; see SitesPage.tsx's
   * own comment). Returns false without adding if `id` collides with an
   * existing site, so callers can surface a validation error. */
  addSite: (site: Site) => boolean
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sites: INITIAL_SITES,
  activeSiteId: 'site-north-yard',
  operatorName: 'MinJae Joo',
  role: typeof window === 'undefined' ? 'supervisor' : initialRole(),
  setRole: (role) => {
    try { localStorage.setItem(ROLE_KEY, role) } catch { /* per-viewer convenience only */ }
    set({ role })
  },
  // `?robot=<id>` preselects a robot (review links, screenshots, a reload --
  // the selection is written back to the URL), then this tab's last selection.
  // Pending until discovered, so a robot whose registration arrives second is
  // not replaced by the first; an unknown id still falls back after the grace.
  selectedRobotId: typeof window === 'undefined' ? null : initialSelectedRobot(window.location.search, storedRobot()),
  selectionPending: typeof window !== 'undefined' && initialSelectedRobot(window.location.search, storedRobot()) !== null,
  pendingDiscoveryStartedAt: null,
  seenRobotIds: [],
  viewMode: typeof window === 'undefined'
    ? 'cockpit'
    : initialViewMode(window.location.search, import.meta.env.VITE_DEFAULT_VIEW),
  cameraFit: 'fit',
  speakVolume: 100,
  setActiveSite: (siteId) => set({ activeSiteId: siteId }),
  setSelectedRobot: (robotId) => set({
    selectedRobotId: robotId,
    selectionPending: !get().seenRobotIds.includes(robotId),
    pendingDiscoveryStartedAt: null,
  }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setCameraFit: (fit) => set({ cameraFit: fit }),
  // Clamped here so no caller can push the robot's audio out of range.
  setSpeakVolume: (volume) => set({ speakVolume: Math.max(0, Math.min(100, Math.round(volume))) }),
  reconcileSelectedRobot: (robotIds, now = Date.now()) => {
    const { selectedRobotId: current, selectionPending, pendingDiscoveryStartedAt, seenRobotIds } = get()
    if (robotIds.some((id) => !seenRobotIds.includes(id))) {
      set({ seenRobotIds: [...new Set([...seenRobotIds, ...robotIds])] })
    }
    // Steady state: selection still valid, change nothing. Must stay a no-op or
    // this re-renders every subscriber on each telemetry frame.
    if (current !== null && robotIds.includes(current)) {
      if (selectionPending) set({ selectionPending: false, pendingDiscoveryStartedAt: null })
      return
    }
    if (current !== null && selectionPending) {
      // An explicit choice not discovered yet. An empty fleet says nothing
      // (SiteShell reconciles against an empty store on mount); a partial one
      // starts the grace period, written once.
      if (robotIds.length === 0) return
      if (pendingDiscoveryStartedAt === null) { set({ pendingDiscoveryStartedAt: now }); return }
      if (now - pendingDiscoveryStartedAt < DISCOVERY_GRACE_MS) return
    }
    if (robotIds.length === 0) {
      if (current !== null) set({ selectedRobotId: null, selectionPending: false, pendingDiscoveryStartedAt: null })
      return
    }
    set({ selectedRobotId: robotIds[0], selectionPending: false, pendingDiscoveryStartedAt: null })
  },
  addSite: (site) => {
    if (get().sites.some((s) => s.id === site.id)) return false
    set((state) => ({ sites: [...state.sites, site] }))
    return true
  },
}))

// Keep the URL and sessionStorage on the selected robot, so a reload -- and Run
// now, which only changes the hash -- comes back on it.
if (typeof window !== 'undefined') {
  useSessionStore.subscribe((state, prev) => {
    if (state.selectedRobotId !== null && state.selectedRobotId !== prev.selectedRobotId) persistSelectedRobot(state.selectedRobotId)
  })
}

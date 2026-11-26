import { create } from 'zustand'
import { SITE_FILTER, USE_REAL_BACKEND } from '@/lib/realtime/backendConfig'
import { mockSites } from '@/mocks/mockOrg'
import { SITE_ROLE_IDS, type SiteRole } from '@/org/roles'
import { siteFromRecord } from '@/org/siteRecords'
import type { SiteCreate, SiteUpdate } from '@/types/sites'

const ROLE_KEY = 'rh.rolePreview'
const ROBOT_KEY = 'rh.selectedRobot'
const STEADY_KEY = 'rh.cameraSteady'

/** The viewer's Steady switch, remembered in this browser. On unless this
 * viewer turned it off (operator's call, 2026-11-23). */
export function initialCameraSteady(stored: string | null): boolean {
  return stored !== 'off'
}

function storedSteady(): string | null {
  try { return localStorage.getItem(STEADY_KEY) } catch { return null }
}

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
 * separate modes. `stacked` is FlightHub 2's live layout and the default since
 * 2026-11-06: the map above a second camera in a left column, the main camera
 * large on the right, so map, front and rear are all on screen at once. */
export type ViewMode = 'stacked' | 'cockpit' | 'map' | 'split' | 'dualcam' | 'grid'

const SELECTABLE_VIEW_MODES: readonly ViewMode[] = ['stacked', 'cockpit', 'map', 'split', 'dualcam', 'grid']

/** Names the camera-first view had before it became Cockpit (`default`,
 * `camera`), kept so old review links and VITE_DEFAULT_VIEW values still land
 * on it. The previous Cockpit — map-led, rail hidden — was retired in its
 * favour, so `cockpit` itself needs no alias. */
const VIEW_MODE_ALIASES: Record<string, ViewMode> = { default: 'cockpit', camera: 'cockpit' }

/** Which view LiveOps opens on: `?view=` in the URL, then the build's
 * VITE_DEFAULT_VIEW, then the three-pane view. Lets a review link open straight on a
 * given layout. Unknown values fall through rather than producing a blank view. */
export function initialViewMode(search: string, buildDefault: string | undefined): ViewMode {
  const candidates = [new URLSearchParams(search).get('view'), buildDefault]
  for (const c of candidates) {
    const mode = c ? (VIEW_MODE_ALIASES[c] ?? c) : null
    if (mode && (SELECTABLE_VIEW_MODES as readonly string[]).includes(mode)) return mode as ViewMode
  }
  return 'stacked'
}
/** How the camera feed fills its pane. The feed is 4:3 (640x480, fixed by the
 * robot) and the panes are wide, so this is a real trade-off rather than a
 * cosmetic one: 'fit' shows the entire frame with bars at the sides, 'fill'
 * crops the top and bottom away to fill the pane. Defaults to 'fit' because the
 * cropped-away region is the ground ahead, obstacles and the robot's own feet --
 * losing it silently is the worse failure for teleoperation. */
export type CameraFit = 'fit' | 'fill'

/** A site as the console holds it: the stored record (GET /sites, spec
 * 2026-11-26 §2) with `id` for `site_id`. org/siteRecords.ts converts. */
export interface Site {
  id: string
  name: string
  timezone?: string
  /** Where the site is, for the Dashboard's site map. Optional: most real
   * sites have none until someone sets it under Sites › Settings. */
  location?: { lat: number; lng: number }
  address?: string | null
  /** The record's `updated_at`; absent for a site no record stands behind. */
  updatedAt?: string
}

/** Where the list of sites has got to. Real mode starts `idle` with no sites
 * and loads them once the session says who is asking; mock mode starts
 * `ready` on the mock provider's own seed. A site route never waits on this:
 * SiteShell takes the id from the address, and a site the list does not hold
 * (yet) still opens. */
export type SitesStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Before a route names a site. Real mode: the deployment's SITE_ID (the
 * VITE_SITE_ID filter, else `site-dev`, which both edge bridges report). It is
 * only an id; the site's name and settings come from GET /sites. */
const DEFAULT_SITE_ID = USE_REAL_BACKEND ? (SITE_FILTER ?? 'site-dev') : mockSites[0].site_id
const INITIAL_SITES: Site[] = USE_REAL_BACKEND ? [] : mockSites.map(siteFromRecord)

/** Counts loads, so only the newest answer is applied. */
let sitesLoadSeq = 0

/** The data provider, imported on first use rather than at load: the
 * provider's own modules read this store, and a test of the store need not
 * build a provider. One import, shared by every caller. */
let providerModule: Promise<typeof import('@/lib/realtime/dataProvider')> | null = null
async function provider() {
  providerModule ??= import('@/lib/realtime/dataProvider')
  return (await providerModule).dataProvider
}

interface SessionState {
  /** The organisation's stored sites the caller may see (GET /sites), in
   * the backend's order. Sites a robot reports with no record are added by
   * org/sites.ts mergeSites, not here. */
  sites: Site[]
  sitesStatus: SitesStatus
  /** Why the last load failed; the previous list is kept meanwhile. */
  sitesError: string | null
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
  /** A robot a person asked for **by name**, as opposed to one reconciliation
   * picked for them -- set only by the links that mean "open this robot"
   * (`RobotLink`, `openRobot`), and consumed once by whatever opens.
   *
   * It exists because `selectedRobotId` cannot answer "did someone ask for
   * this?": `reconcileSelectedRobot` writes it on its own whenever the
   * selection is invalid and the site has robots, so on touch Fleet must
   * ignore it and open on its roster (design decision D3). Without this
   * one-shot a tapped robot link would set the selection, navigate to Fleet
   * and land on the roster -- changing which robot LiveOps shows while
   * appearing to do nothing. */
  requestedRobotId: string | null
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
  /** Steady camera: smooth the gait's shake out of the main camera, per viewer
   * (lib/stabilise). Persisted in localStorage, unlike cameraFit, because it is
   * a standing preference rather than a framing of the moment. */
  cameraSteady: boolean
  /** LiveOps on touch is showing as the live view: no site bar, no bottom tab
   * bar (design §6.2). True on arrival -- entering LiveOps *is* entering the
   * live view -- and set false by the back chevron in `TouchTopStrip`, which
   * brings the console's navigation back in place.
   *
   * Session state rather than component state because `SiteShell` (which draws
   * the two bars) and `TouchLiveOps` (which draws the chevron) are siblings
   * with no path between them, and because it must survive a workspace round
   * trip. Deliberately **not** persisted, unlike `cameraSteady`: it is where
   * this visit to LiveOps has got to, not a standing preference, and
   * `navigateWorkspace` sets it back to true on every arrival.
   *
   * Never read on a fine pointer: `useTouchShell().touch` gates every use. */
  liveOpsImmersed: boolean
  /** Announcement playback volume, 0-100. Session state rather than per-tab local
   * state so one setting governs every way of producing audio (a stored clip, a
   * typed announcement, a shout) and survives closing the popover. */
  speakVolume: number
  setActiveSite: (siteId: string) => void
  setSelectedRobot: (robotId: string) => void
  /** Select a robot *and* record that a person asked for it, so the workspace
   * it opens in can tell this apart from the shell's own reconciliation. */
  requestRobot: (robotId: string) => void
  /** Forget the request: called by whoever consumed it, on mount. Keeping it
   * would open an inspector on some later, ordinary visit. */
  clearRequestedRobot: () => void
  setViewMode: (mode: ViewMode) => void
  setCameraFit: (fit: CameraFit) => void
  setCameraSteady: (steady: boolean) => void
  setLiveOpsImmersed: (immersed: boolean) => void
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
  /** Fetch the sites again (GET /sites). Keeps the list on screen while it
   * fetches, and keeps it if the fetch fails. */
  loadSites: () => Promise<void>
  /** Org › Sites "New site" (POST /sites): persists, then joins the list.
   * Throws the provider's ApiError (409 taken id, 422 bad field). */
  addSite: (site: SiteCreate) => Promise<Site>
  /** Edit site (PATCH /sites/{id}). Throws as addSite does. */
  updateSite: (siteId: string, patch: SiteUpdate) => Promise<Site>
  /** Delete site. Throws the ApiError, 409 while robots or maps keep it. */
  deleteSite: (siteId: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sites: INITIAL_SITES,
  sitesStatus: USE_REAL_BACKEND ? 'idle' : 'ready',
  sitesError: null,
  activeSiteId: DEFAULT_SITE_ID,
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
  requestedRobotId: null,
  pendingDiscoveryStartedAt: null,
  seenRobotIds: [],
  viewMode: typeof window === 'undefined'
    ? 'stacked'
    : initialViewMode(window.location.search, import.meta.env.VITE_DEFAULT_VIEW),
  cameraFit: 'fit',
  cameraSteady: typeof window === 'undefined' ? true : initialCameraSteady(storedSteady()),
  liveOpsImmersed: true,
  speakVolume: 100,
  setActiveSite: (siteId) => set({ activeSiteId: siteId }),
  setSelectedRobot: (robotId) => set({
    selectedRobotId: robotId,
    selectionPending: !get().seenRobotIds.includes(robotId),
    pendingDiscoveryStartedAt: null,
  }),
  requestRobot: (robotId) => {
    get().setSelectedRobot(robotId)
    set({ requestedRobotId: robotId })
  },
  clearRequestedRobot: () => { if (get().requestedRobotId !== null) set({ requestedRobotId: null }) },
  setViewMode: (mode) => set({ viewMode: mode }),
  setCameraFit: (fit) => set({ cameraFit: fit }),
  setCameraSteady: (steady) => {
    try { localStorage.setItem(STEADY_KEY, steady ? 'on' : 'off') } catch { /* per-viewer convenience only */ }
    set({ cameraSteady: steady })
  },
  // Per visit, so nothing is written to storage: the next arrival on LiveOps
  // immerses again whatever this one did.
  setLiveOpsImmersed: (immersed) => set({ liveOpsImmersed: immersed }),
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
  loadSites: async () => {
    const seq = ++sitesLoadSeq
    set({ sitesStatus: 'loading' })
    try {
      const records = await (await provider()).listSites()
      if (seq !== sitesLoadSeq) return
      set({ sites: records.map(siteFromRecord), sitesStatus: 'ready', sitesError: null })
    } catch (e) {
      if (seq !== sitesLoadSeq) return
      set({ sitesStatus: 'error', sitesError: e instanceof Error ? e.message : String(e) })
    }
  },
  addSite: async (create) => {
    const site = siteFromRecord(await (await provider()).createSite(create))
    set((state) => ({ sites: [...state.sites.filter((s) => s.id !== site.id), site] }))
    return site
  },
  updateSite: async (siteId, patch) => {
    const site = siteFromRecord(await (await provider()).updateSite(siteId, patch))
    set((state) => ({ sites: state.sites.map((s) => (s.id === site.id ? site : s)) }))
    return site
  },
  deleteSite: async (siteId) => {
    await (await provider()).deleteSite(siteId)
    set((state) => ({ sites: state.sites.filter((s) => s.id !== siteId) }))
  },
}))

// Keep the URL and sessionStorage on the selected robot, so a reload -- and Run
// now, which only changes the hash -- comes back on it.
if (typeof window !== 'undefined') {
  useSessionStore.subscribe((state, prev) => {
    if (state.selectedRobotId !== null && state.selectedRobotId !== prev.selectedRobotId) persistSelectedRobot(state.selectedRobotId)
  })
}

// Real mode: load the sites once the session says who is asking -- sign-in
// off, or signed in -- and again when that person changes, since GET /sites
// answers only the sites they may see. Mock mode is seeded already.
if (typeof window !== 'undefined' && USE_REAL_BACKEND) {
  void import('@/lib/auth/authStore').then(({ useAuthStore }) => {
    type Auth = ReturnType<typeof useAuthStore.getState>
    const asking = (a: Auth) => (a.status === 'off' || a.status === 'signedIn' ? a.user?.user_id ?? '' : null)
    if (asking(useAuthStore.getState()) !== null) void useSessionStore.getState().loadSites()
    useAuthStore.subscribe((a, prev) => {
      const who = asking(a)
      if (who !== null && who !== asking(prev)) void useSessionStore.getState().loadSites()
    })
  })
}

import { create } from 'zustand'

export type OperatorRole = 'operator' | 'supervisor' | 'engineer' | 'admin'
export type ViewMode = 'default' | 'cockpit' | 'split' | 'grid'
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
  setActiveSite: (siteId: string) => void
  setSelectedRobot: (robotId: string) => void
  setViewMode: (mode: ViewMode) => void
  setCameraFit: (fit: CameraFit) => void
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

export const useSessionStore = create<SessionState>((set, get) => ({
  sites: [{ id: 'site-north-yard', name: 'North Yard — Site 1' }],
  activeSiteId: 'site-north-yard',
  operatorName: 'MinJae Joo',
  role: 'operator',
  selectedRobotId: null,
  viewMode: 'default',
  cameraFit: 'fit',
  setActiveSite: (siteId) => set({ activeSiteId: siteId }),
  setSelectedRobot: (robotId) => set({ selectedRobotId: robotId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setCameraFit: (fit) => set({ cameraFit: fit }),
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

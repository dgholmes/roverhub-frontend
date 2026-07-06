import { create } from 'zustand'

export type OperatorRole = 'operator' | 'supervisor' | 'engineer' | 'admin'
export type ViewMode = 'default' | 'cockpit' | 'split' | 'grid'

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
  selectedRobotId: string | null
  viewMode: ViewMode
  setActiveSite: (siteId: string) => void
  setSelectedRobot: (robotId: string) => void
  setViewMode: (mode: ViewMode) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sites: [{ id: 'site-north-yard', name: 'North Yard — Site 1' }],
  activeSiteId: 'site-north-yard',
  operatorName: 'MinJae Joo',
  role: 'operator',
  selectedRobotId: 'zaezae-x1-001',
  viewMode: 'default',
  setActiveSite: (siteId) => set({ activeSiteId: siteId }),
  setSelectedRobot: (robotId) => set({ selectedRobotId: robotId }),
  setViewMode: (mode) => set({ viewMode: mode }),
}))

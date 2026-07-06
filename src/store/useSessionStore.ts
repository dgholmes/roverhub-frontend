import { create } from 'zustand'

export type OperatorRole = 'operator' | 'supervisor' | 'engineer' | 'admin'
export type ViewMode = 'default' | 'cockpit' | 'split' | 'grid'

interface SessionState {
  siteId: string
  siteName: string
  operatorName: string
  /** Auth0 + RBAC is not wired in Phase 1 — single mocked role, honoring the
   * same show/hide rules the real roles would (docs/05-ui-ux.md §18.5). */
  role: OperatorRole
  selectedRobotId: string | null
  viewMode: ViewMode
  setSelectedRobot: (robotId: string) => void
  setViewMode: (mode: ViewMode) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  siteId: 'site-north-yard',
  siteName: 'North Yard — Site 1',
  operatorName: 'MinJae Joo',
  role: 'operator',
  selectedRobotId: 'zaezae-x1-001',
  viewMode: 'default',
  setSelectedRobot: (robotId) => set({ selectedRobotId: robotId }),
  setViewMode: (mode) => set({ viewMode: mode }),
}))

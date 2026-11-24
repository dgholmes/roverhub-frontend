/**
 * Whether the touch shell's bottom tab bar is on screen.
 *
 * This is the one decision in M4 that can take the operator's controls away,
 * so it is kept pure: no store, no DOM, no `window`. That keeps it testable in
 * Vitest's `node` environment and stated in exactly one place.
 *
 * The bar is hidden only on LiveOps, and only while the operator is driving.
 * LiveOps is the one workspace whose bottom edge holds the drive and command
 * controls; on other workspaces the bar never sits over anything the operator
 * is steering with, so hiding it there would only cost navigation.
 *
 * ⚠️ `driving` must come from `operatorHoldsControl` in
 * `src/liveops/controlOwner.ts` and from nothing else (design decision D2).
 * Never derive it from `abstract_state`, and never from `control_owner != null`:
 * a mission holds `control_owner` too, and an operator who is not driving must
 * get the bar back. The caller (Task 4) computes the boolean and passes it in;
 * this module does not import it, so it stays free of store imports.
 */

import type { Workspace } from '@/app/routes'

/** Height of the bottom tab bar, in CSS pixels. */
export const TOUCH_TAB_BAR_HEIGHT = 58

/** Height of the per-site bar that sits above the tab bar, in CSS pixels. */
export const TOUCH_SITE_BAR_HEIGHT = 44

export interface TabBarInput {
  /** The touch shell is in use (see `shouldUseTouchShell`). */
  touch: boolean
  /** The current workspace, or `null` for the org console, which has no LiveOps. */
  workspace: Workspace | null
  /** The operator holds control of the robot; from `operatorHoldsControl` only. */
  driving: boolean
}

/** Show the tab bar on touch whenever the operator is not driving on LiveOps. */
export function shouldShowTabBar({ touch, workspace, driving }: TabBarInput): boolean {
  return touch && !(workspace === 'LiveOps' && driving)
}

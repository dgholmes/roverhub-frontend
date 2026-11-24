/**
 * Whether the touch shell's bottom tab bar is on screen.
 *
 * This is the one decision in M4 that can take the operator's controls away,
 * so it is kept pure: no store, no DOM, no `window`. That keeps it testable in
 * Vitest's `node` environment and stated in exactly one place.
 *
 * The bar is hidden only on LiveOps, and there it has **two independent
 * reasons** to be away:
 *
 * - `driving` -- the operator holds control, so the bottom edge of the screen
 *   is their drive and command controls rather than navigation;
 * - `immersed` -- LiveOps on touch opens as the live view with no chrome
 *   around it (design §6.2), and the strip's back chevron un-immerses.
 *
 * ⚠️ They are independent on purpose, and `driving` is the one that must never
 * be overridable by the flag: an operator who taps back while driving gets the
 * site bar and the rest of the console back, but still no tab bar, because the
 * bar would sit on top of the sticks. So this is an `||` of the two reasons,
 * never a precedence between them.
 *
 * On the other workspaces the bar never sits over anything the operator is
 * steering with, so hiding it there would only cost navigation -- neither flag
 * is read outside LiveOps.
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
  /** LiveOps is showing as the live view, with no console chrome around it
   * (`liveOpsImmersed` in the session store). Read on LiveOps only, and never
   * able to bring the bar back while `driving`. */
  immersed: boolean
}

/** Show the tab bar on touch whenever LiveOps is neither immersed nor driven. */
export function shouldShowTabBar({ touch, workspace, driving, immersed }: TabBarInput): boolean {
  return touch && !(workspace === 'LiveOps' && (driving || immersed))
}

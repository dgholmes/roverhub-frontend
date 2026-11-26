/**
 * Which console shell to render, and how to lay it out once chosen.
 *
 * Both functions here are pure so they can be tested in Vitest's `node`
 * environment, where there is no `window` and no `matchMedia`. The browser
 * plumbing lives in `useTouchShell.ts`, which is the only module that touches
 * those APIs.
 *
 * ⚠️ **The primary pointer decides, not the viewport width.** A Windows laptop
 * with a touchscreen driven by a mouse reports `(pointer: coarse)` false and
 * must keep the desktop console, and a desktop window dragged narrow must not
 * flip to the touch shell — a width breakpoint gets both of those wrong. A
 * 12.9-inch iPad is wider than many desktop windows and still wants touch
 * controls. See the design's §7.1.
 */

/** `?ui=touch` / `?ui=desktop`, the development and review override. */
export type UiOverride = 'touch' | 'desktop' | null

/** Read the `ui` override out of a location search string.
 * Tolerates a missing leading `?` so a caller can pass either form. */
export function uiOverride(search: string): UiOverride {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const value = params.get('ui')
  return value === 'touch' || value === 'desktop' ? value : null
}

/**
 * Should the touch shell be used?
 *
 * `search` is passed in rather than read from `window`, so this stays pure and
 * testable. `?ui=` overrides the pointer test in **both** directions, so the
 * touch shell can be worked on from a laptop with no tablet to hand, and a
 * review link can pin either shell.
 */
export function shouldUseTouchShell(opts: { coarsePointer: boolean; search: string }): boolean {
  const override = uiOverride(opts.search)
  if (override) return override === 'touch'
  return opts.coarsePointer
}

export type Orientation = 'landscape' | 'portrait'

/** The short side at or above which the shell uses tablet sizing. */
export const BIG_SHORT_SIDE_PX = 600

/** Below this viewport width a page shows one pane at a time (list, then
 * detail with a way back). At or above it, a page keeps its desktop layout. */
export const NARROW_WIDTH_PX = 700

export interface TouchLayout {
  orientation: Orientation
  /** Tablet sizing when the short side is at least 600 px, else phone sizing. */
  big: boolean
  /**
   * The viewport is too narrow for a page's side-by-side panes. This, never
   * `touch`, is what may change a page's layout (2026-11-26): `touch` says a
   * finger is the pointer, which is a question of how a control is pressed,
   * not of how much fits. A 1366 px tablet is not narrow, and gets the desktop
   * layout with every pane and action in it; a narrow desktop window is, and
   * gets the one-pane layout a phone does.
   */
  narrow: boolean
}

/** The two independent layout axes — never a device name, and never a
 * user-agent sniff. Four combinations, all of which are designed rather than
 * scaled. A square viewport counts as portrait. */
export function layoutFor(size: { width: number; height: number }): TouchLayout {
  const { width, height } = size
  return {
    orientation: width > height ? 'landscape' : 'portrait',
    big: Math.min(width, height) >= BIG_SHORT_SIDE_PX,
    narrow: width < NARROW_WIDTH_PX,
  }
}

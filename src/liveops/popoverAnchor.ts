/**
 * Where a panel opened from a control in a bar should start.
 *
 * Anchoring to the trigger looks right until the trigger is a 28 px chip
 * centred in a 44 px bar: 8 px below the chip is the bar's own bottom edge,
 * so the panel came out flush against it and read as part of the chrome
 * rather than as something that had opened (operator, 2026-11-25). The gap
 * belongs below the BAR, not below the button.
 *
 * `BAR_SELECTOR` is the set of bars this applies to. `data-card-bound="top"`
 * already marks "a bar at the top that floating things must clear", which is
 * exactly this question, so the two share it rather than keeping two lists.
 */

export const POPOVER_GAP = 8

const BAR_SELECTOR = '[data-card-bound="top"], [data-card-bound="bottom"], [data-touch-strip]'

/**
 * The y a panel should open at, given the trigger it belongs to.
 *
 * Falls back to the trigger's own rect when it is not in a bar, which is
 * every other caller. `null` when there is nothing to measure yet.
 */
export function popoverTop(trigger: Element | null | undefined): number | null {
  if (!trigger) return null
  const bar = trigger.closest(BAR_SELECTOR)
  const box = (bar ?? trigger).getBoundingClientRect()
  return box.bottom + POPOVER_GAP
}

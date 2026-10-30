/**
 * The edge bridge's battery thresholds, as the console mirrors them.
 *
 * These MIRROR the bridge defaults `SAFETY_MIN_BATTERY_PCT` (15) and
 * `SAFETY_DRIVE_FLOOR_BATTERY_PCT` (5), decided 2026-10-30. They are not read
 * from the bridge, so they can drift if a device's `.env` sets different
 * values: the console then offers (or hides) something the bridge disagrees
 * with, and the bridge's answer -- REJECTED_LOW_BATTERY /
 * REJECTED_BATTERY_CRITICAL / REJECTED_BATTERY_UNKNOWN -- is the real one.
 * Change both sides together.
 *
 * Tiers: (1) always allowed; (2) allowed down to DRIVE_FLOOR; (3) new work,
 * allowed only at or above MIN. A null battery is "unknown": never "empty", and the
 * console does not gate on it (the bridge decides). No bare comparison on null.
 */
export const MIN_BATTERY_PCT = 15
export const DRIVE_FLOOR_BATTERY_PCT = 5

/** A KNOWN reading below the new-work line. Unknown (null/undefined) is never
 *  "low": the bridge's gate may be off (threshold 0), and when it is on it
 *  refuses with its own code, so the console leaves unknown to the bridge. */
export function belowNewWorkLine(percent: number | null | undefined): boolean {
  return percent !== null && percent !== undefined && percent < MIN_BATTERY_PCT
}

/** A KNOWN reading below the drive floor. Unknown is left to the bridge. */
export function belowDriveFloor(percent: number | null | undefined): boolean {
  return percent !== null && percent !== undefined && percent < DRIVE_FLOOR_BATTERY_PCT
}

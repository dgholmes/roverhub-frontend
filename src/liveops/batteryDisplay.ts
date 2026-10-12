import { color } from '@/design-system/tokens'

/**
 * How the UI renders a battery level that may not be known.
 *
 * `null` means the bridge has no reading, which is the normal state on a
 * gRPC-only deployment: gRPC's `GetRobotStateResponse` carries no battery field
 * at all, so the value exists only when the DDS BMS subscription (E6) is wired
 * and delivering. It previously arrived as a fabricated `0.0` and rendered as
 * "0%" — a flat battery, indistinguishable from a real one, on every screen.
 *
 * Kept as pure functions in their own module (rather than inside
 * `BatteryStatus.tsx`) so the display rule is unit-testable — the frontend test
 * environment is `node`, with no component renderer.
 *
 * See docs/audit/2026-08-12-prd-vs-sdk-direction-audit.md F1.
 */

export const BATTERY_UNKNOWN_LABEL = '—'

export function formatBatteryPercent(percent: number | null): string {
  // Whole percent: the BMS reports fractions ("77.88%") that imply a
  // precision no operator decision depends on, and jitter at 5 Hz.
  return percent === null ? BATTERY_UNKNOWN_LABEL : `${Math.round(percent)}%`
}

export function batteryLevelColor(percent: number | null): string {
  // Muted, not red: an unknown battery is a wiring/deployment fact, not an
  // emergency, and colouring it red would cry wolf on every gRPC-only host.
  // Equally it must not read as healthy — hence muted rather than primary text.
  if (percent === null) return color.t3
  if (percent <= 15) return color.red
  if (percent <= 30) return color.amber
  // A healthy battery is plain primary text. Colour is reserved for levels an
  // operator has to act on; painting every healthy reading green (or, before,
  // lime) made the low ones harder to spot.
  return color.t1
}

/** Bar width for a meter. An unknown level draws an empty track, not a full
 * or zero-width bar implying a measurement we don't have. */
export function batteryBarWidth(percent: number | null): string {
  return percent === null ? '0%' : `${percent}%`
}

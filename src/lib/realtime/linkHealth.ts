/**
 * Whether the console can be trusted to be showing current data.
 *
 * The console had no notion of this. `connectBroker` registered only a
 * `connect` handler, so mqtt.js retried silently forever; nothing anywhere
 * compared `updated_at` against the clock. When the socket died, every value on
 * screen froze at its last reading while still carrying `freshness: 'live'`,
 * the footer went on reporting "All Systems Nominal", and an empty robot list
 * rendered as "No robots assigned to this site yet." — a configuration message
 * for what was actually an outage.
 *
 * Two independent facts decide this, and both matter:
 *  - the transport (are we connected to the broker at all?)
 *  - the data (are frames still arriving over that connection?)
 *
 * A healthy socket delivering nothing is the more dangerous of the two, because
 * nothing looks wrong. docs/audit/2026-08-12-ui-ux-audit.md A-06/A-07.
 */

export type LinkPhase = 'connecting' | 'connected' | 'reconnecting' | 'offline'
export type TelemetryFreshness = 'live' | 'delayed' | 'lost'
export type BannerSeverity = 'info' | 'warning' | 'error'

/** The bridge publishes telemetry at 10Hz and heartbeat at 1Hz, so a gap of
 * seconds is already far outside normal. */
export const TELEMETRY_DELAYED_AFTER_MS = 3_000

/** Past this, displayed values are history, not status. */
export const TELEMETRY_LOST_AFTER_MS = 10_000

/** `null` age means no frame has ever arrived — which is `lost`, not `live`.
 * Defaulting the unknown case to healthy is precisely how a UI ends up
 * asserting things about data it does not have. */
export function telemetryFreshness(ageMs: number | null): TelemetryFreshness {
  if (ageMs === null) return 'lost'
  if (ageMs >= TELEMETRY_LOST_AFTER_MS) return 'lost'
  if (ageMs >= TELEMETRY_DELAYED_AFTER_MS) return 'delayed'
  return 'live'
}

export interface LinkBanner {
  severity: BannerSeverity
  message: string
}

/**
 * The single banner to show, or `null` when everything is genuinely fine.
 *
 * Transport problems outrank staleness: when the socket is down the staleness
 * is a *symptom*, and naming the cause is what tells the operator what to do.
 */
export function linkBanner(phase: LinkPhase, freshness: TelemetryFreshness): LinkBanner | null {
  if (phase === 'offline') {
    return {
      severity: 'error',
      message: 'Disconnected from the live data service. Values shown are the last known readings.',
    }
  }
  if (phase === 'reconnecting') {
    return { severity: 'warning', message: 'Reconnecting to the live data service…' }
  }
  if (phase === 'connecting') {
    return { severity: 'info', message: 'Connecting to the live data service…' }
  }
  if (freshness === 'lost') {
    return {
      severity: 'error',
      message: 'Telemetry lost — values shown are the last known readings, not current status.',
    }
  }
  if (freshness === 'delayed') {
    return { severity: 'warning', message: 'Telemetry delayed — values may not be current.' }
  }
  return null
}

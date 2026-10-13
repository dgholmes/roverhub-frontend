import type { RobotState } from '@/types'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'

/** Bridges heartbeat every 5 s (config.heartbeat_interval_s). Three missed
 * beats is late; a minute is silent. */
export const HEARTBEAT_INTERVAL_S = 5
const LATE_AFTER_MS = 3 * HEARTBEAT_INTERVAL_S * 1000
const SILENT_AFTER_MS = 60_000

export type BridgeLiveness = 'live' | 'late' | 'silent' | 'unknown'

export function bridgeLiveness(lastHeartbeatAt: string | null | undefined, now = Date.now()): BridgeLiveness {
  if (!lastHeartbeatAt) return 'unknown'
  const at = Date.parse(lastHeartbeatAt)
  if (Number.isNaN(at)) return 'unknown'
  const age = now - at
  if (age > SILENT_AFTER_MS) return 'silent'
  if (age > LATE_AFTER_MS) return 'late'
  return 'live'
}

/** "4 s ago", "15 min ago", "3 h ago". */
export function formatAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never'
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return 'Unknown'
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export type SchemaMatch = 'match' | 'mismatch' | 'unknown'

export function schemaMatch(version: string | null | undefined): SchemaMatch {
  if (!version) return 'unknown'
  return version === EXPECTED_SCHEMA_VERSION ? 'match' : 'mismatch'
}

/** The edge device's LAN host, read from its configured camera relay URL —
 * the only place the console learns a device address today. */
export function deviceHostFromUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/** Bridges that most need a look come first: silent, then unknown, late, live. */
export function bridgeSortPriority(robot: Pick<RobotState, 'bridge'>, now = Date.now()): number {
  const order: Record<BridgeLiveness, number> = { silent: 0, unknown: 1, late: 2, live: 3 }
  return order[bridgeLiveness(robot.bridge?.last_heartbeat_at, now)]
}

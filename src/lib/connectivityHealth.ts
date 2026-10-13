import i18n from '@/i18n'
import type { RobotState, SdkLinkStatus } from '@/types'

/**
 * How the two independent robot-health signals combine.
 *
 * Two topics carry overlapping information and arrive at very different rates:
 *
 * - `/heartbeat` (every 5s) carries `sdk_connected`, the only signal that
 *   actually knows whether a gRPC call succeeded. **Authoritative.**
 * - `/telemetry` (10Hz) carries `grpc_freshness`, which says how old the last
 *   successful poll is. Fast, but it can only ever say "getting stale" — the
 *   bridge keeps republishing its last known snapshot, so frames keep arriving
 *   at full rate even while the robot is powered off.
 *
 * The rule: **telemetry may downgrade, never upgrade.** Heartbeat alone can
 * restore `connected`.
 *
 * Without that asymmetry the two clobber each other. The previous mapping was
 * `grpc_freshness === 'missing' ? 'unavailable' : 'connected'`, and
 * `'missing'` only ever means "no poll has *ever* succeeded" — so once the
 * bridge had seen the robot once, every subsequent frame asserted
 * `grpc: 'connected'` regardless. With the robot switched off that meant the
 * heartbeat's correct `unavailable` was overwritten 100ms later, ten times a
 * second, and the UI showed "SDK Connected" with a brief flicker every 5s.
 */

const GRPC_SEVERITY: Record<SdkLinkStatus, number> = {
  connected: 0,
  degraded: 1,
  unavailable: 2,
}

/** What a telemetry frame's freshness implies about the gRPC link on its own. */
export function grpcFromFreshness(freshness: RobotState['position']['freshness']): SdkLinkStatus {
  if (freshness === 'missing') return 'unavailable'
  if (freshness === 'stale') return 'degraded'
  return 'connected'
}

/** The worse (more severe) of two link statuses. */
export function worseGrpcStatus(a: SdkLinkStatus, b: SdkLinkStatus): SdkLinkStatus {
  return GRPC_SEVERITY[a] >= GRPC_SEVERITY[b] ? a : b
}

/**
 * gRPC status after applying a telemetry frame — downgrade-only, so a stale
 * frame can reveal an outage quickly without ever contradicting the heartbeat.
 * `existing` is undefined the first time a robot is seen, before any heartbeat
 * has arrived; the frame's own freshness is all we have then.
 */
export function grpcAfterTelemetry(
  existing: SdkLinkStatus | undefined,
  freshness: RobotState['position']['freshness'],
): SdkLinkStatus {
  const fromFrame = grpcFromFreshness(freshness)
  return existing === undefined ? fromFrame : worseGrpcStatus(existing, fromFrame)
}

/**
 * Whether the robot itself is reachable, as distinct from whether the edge
 * bridge is. The bridge can be perfectly healthy and reporting while the robot
 * it manages is powered off — which is exactly the case that used to render as
 * a confident "Standing".
 */
export function isRobotReachable(robot: Pick<RobotState, 'connectivity'>): boolean {
  return robot.connectivity.grpc === 'connected'
}

export type RobotReachability = 'online' | 'robot-unreachable' | 'bridge-offline'

/**
 * Which of the three distinct offline situations a robot is in. Collapsing
 * these loses the operator's most useful diagnostic: "is my bridge down, or is
 * the robot switched off?"
 */
export function reachabilityOf(robot: Pick<RobotState, 'connectivity'>): RobotReachability {
  if (robot.connectivity.bridge_state !== 'connected') return 'bridge-offline'
  if (robot.connectivity.grpc !== 'connected') return 'robot-unreachable'
  return 'online'
}

/** Reachability text in the current language; `short` for narrow rows.
 * The English consts below stay as the source wording. */
export function reachabilityLabel(r: RobotReachability, short = false): string {
  if (r === 'online') return ''
  if (r === 'bridge-offline') return i18n.t('misc.bridgeOffline')
  return i18n.t(short ? 'misc.unreachableShort' : 'misc.robotUnreachable')
}

export const REACHABILITY_LABELS: Record<RobotReachability, string> = {
  'online': '',
  'robot-unreachable': 'Robot unreachable',
  'bridge-offline': 'Bridge offline',
}

/** For narrow containers (the left rail's list rows), where the full labels
 * wrap onto two lines. Same distinction, fewer characters. */
export const REACHABILITY_LABELS_SHORT: Record<RobotReachability, string> = {
  'online': '',
  'robot-unreachable': 'Unreachable',
  'bridge-offline': 'Bridge offline',
}

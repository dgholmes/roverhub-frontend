import type { RobotState } from '@/types'

export const DISPATCH_BATTERY_THRESHOLD = 30

export interface ReadinessResult {
  ready: boolean
  failing: string[]
}

/**
 * Fleet readiness model (docs/05-ui-ux.md §10.5) — a composite of six factors.
 * "Ready" specifically means available for a new dispatch, not merely
 * functioning: a robot already in AUTO_MISSION/RETURNING/DOCKING is busy, not
 * ready, since only PASSIVE/STAND indicate it's free to accept a new mission.
 * This is the same model the Missions workspace will later use for dispatch
 * validation — kept here as the one shared source, mirroring commandPolicy.ts.
 */
export function getFleetReadiness(robot: RobotState): ReadinessResult {
  const failing: string[] = []

  if (robot.connectivity.bridge_state !== 'connected') failing.push('Edge bridge not connected')
  if (robot.connectivity.grpc !== 'connected') failing.push('SDK (gRPC) not connected')
  if (robot.connectivity.dds !== 'connected') failing.push('Telemetry (DDS) not connected')
  if (robot.battery.percent < DISPATCH_BATTERY_THRESHOLD) {
    failing.push(`Battery below dispatch threshold (${robot.battery.percent}% < ${DISPATCH_BATTERY_THRESHOLD}%)`)
  }
  if (robot.abstract_state !== 'PASSIVE' && robot.abstract_state !== 'STAND') {
    failing.push(`Not idle (state: ${robot.abstract_state})`)
  }
  if (robot.maintenance_flagged) failing.push('Flagged for maintenance')

  return { ready: failing.length === 0, failing }
}

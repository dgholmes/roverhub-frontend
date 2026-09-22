import type { AbstractState, RobotState } from '@/types'

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
  // Checked explicitly for null before comparing: `null < 30` is false in JS,
  // so an unknown battery used to sail through readiness as though it were
  // healthy. Unknown is not the same as low, and neither is dispatchable.
  // See docs/audit/2026-08-12-prd-vs-sdk-direction-audit.md F1.
  if (robot.battery.percent === null) {
    failing.push('Battery level unknown (no DDS BMS reading)')
  } else if (robot.battery.percent < DISPATCH_BATTERY_THRESHOLD) {
    failing.push(`Battery below dispatch threshold (${robot.battery.percent}% < ${DISPATCH_BATTERY_THRESHOLD}%)`)
  }
  if (robot.abstract_state !== 'PASSIVE' && robot.abstract_state !== 'STAND') {
    failing.push(`Not idle (state: ${robot.abstract_state})`)
  }
  // A fallen robot is not dispatchable whatever else is true of it. This is
  // checked explicitly because it is no longer implied by abstract_state: while
  // `recovery` mapped to FAULT, a downed robot failed the idle check and read
  // as a fault everywhere. Reclassifying `recovery` as ordinary motion made a
  // fallen robot report MANUAL/ASSISTED, which silently removed the only
  // fleet-wide "this robot is down" signal there was.
  if (robot.posture === 'fallen') failing.push('Fallen — needs recovery')
  if (robot.maintenance_flagged) failing.push('Flagged for maintenance')

  return { ready: failing.length === 0, failing }
}

/** Faults surface first by default (docs/05-ui-ux.md §10.1). */
const STATE_PRIORITY: Record<AbstractState, number> = {
  E_STOP: 0, FAULT: 1, RETURNING: 2, DOCKING: 3, AUTO_MISSION: 4,
  ASSISTED: 5, MANUAL: 6, STAND: 7, PASSIVE: 8,
}

/**
 * Default Fleet-table row ordering — lower sorts first.
 *
 * A fallen robot ranks with FAULT no matter what state it reports. It used
 * simply to *be* one: `recovery` mapped to FAULT, so a downed robot sorted to
 * the top of the table on its own. Now that it reports MANUAL/ASSISTED instead,
 * without this it would sort into the middle of a healthy fleet and an operator
 * would have to open LiveOps on that specific robot to find out it was down.
 *
 * Lives here rather than in FleetTable so the rule is testable — this project's
 * Vitest setup has no DOM, so nothing inside a component can be covered.
 */
export function fleetSortPriority(robot: Pick<RobotState, 'abstract_state' | 'posture'>): number {
  const byState = STATE_PRIORITY[robot.abstract_state]
  return robot.posture === 'fallen' ? Math.min(byState, STATE_PRIORITY.FAULT) : byState
}

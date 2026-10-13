import type { RobotState } from '@/types'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { bridgeLiveness } from './bridgeHealth'
import { motorHeat } from './motorHeat'
import { hottestLegMotor } from './motorLayout'

export type AttentionSeverity = 'critical' | 'warning'

/** Where in Fleet's robot inspector the problem is shown. */
export type AttentionPlace = 'status' | 'motors' | 'edge'

export interface Attention {
  severity: AttentionSeverity
  /** Short, lower-case: reads after the robot's name ("Atlas · motor hot"). */
  text: string
  place: AttentionPlace
}

/**
 * The one thing about this robot that most needs a person, or null when
 * nothing does. Fleet's roster, the org Dashboard and the Sites cards all
 * use this, so "needs attention" means the same thing everywhere.
 *
 * Order is severity: a fallen robot outranks a hot motor on the same robot.
 */
export function robotAttention(r: RobotState, now = Date.now()): Attention | null {
  if (r.posture === 'fallen') return { severity: 'critical', text: 'fallen', place: 'status' }
  if (r.abstract_state === 'E_STOP') return { severity: 'critical', text: 'E-Stop engaged', place: 'status' }
  if (r.abstract_state === 'FAULT') return { severity: 'critical', text: 'fault', place: 'status' }
  if (reachabilityOf(r) !== 'online') return { severity: 'warning', text: 'unreachable', place: 'edge' }
  // The edge device is part of the robot, so a silent one is the robot's problem.
  if (r.bridge && bridgeLiveness(r.bridge.last_heartbeat_at, now) === 'silent') {
    return { severity: 'warning', text: 'edge device silent', place: 'edge' }
  }
  const hot = hottestLegMotor(r)
  if (hot && motorHeat(hot.tempC) !== 'normal') {
    return {
      severity: motorHeat(hot.tempC) === 'hot' ? 'critical' : 'warning',
      text: `${hot.label} ${Math.round(hot.tempC)} °C`,
      place: 'motors',
    }
  }
  if (r.battery.percent !== null && r.battery.percent < 20 && !r.battery.charging) {
    return { severity: 'warning', text: `battery ${Math.round(r.battery.percent)}%`, place: 'status' }
  }
  return null
}

/** Critical first, then warning; stable otherwise. */
export function bySeverity(a: Attention | null, b: Attention | null): number {
  const rank = (x: Attention | null) => (x === null ? 2 : x.severity === 'critical' ? 0 : 1)
  return rank(a) - rank(b)
}

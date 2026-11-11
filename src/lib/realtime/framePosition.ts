import { headingFromYaw } from '@/lib/heading'
import type { RobotPosition } from '@/types'

/** The telemetry fields a robot position is derived from. */
export interface FramePositionInput {
  pos_body: [number, number, number]
  ori_body?: [number, number, number]
  grpc_freshness: RobotPosition['freshness']
  captured_at: string
  /** The bridge's position provider's answer (shared TelemetryFrame.position,
   * schema 0.0.15). Unvalidated off MQTT, so typed unknown. */
  position?: unknown
}

const PROVIDERS = new Set(['dead_reckoning', 'slam', 'gps'])
const QUALITIES = new Set(['estimated', 'localized', 'lost'])
const FRESHNESS = new Set(['live', 'stale', 'missing'])

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** A RobotPosition, or null when `v` is not a well-formed one. */
function readPosition(v: unknown): RobotPosition | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  if (!isFiniteNumber(p.x_m) || !isFiniteNumber(p.y_m) || !isFiniteNumber(p.heading_deg)) return null
  if (typeof p.provider !== 'string' || !PROVIDERS.has(p.provider)) return null
  if (typeof p.quality !== 'string' || !QUALITIES.has(p.quality)) return null
  if (typeof p.freshness !== 'string' || !FRESHNESS.has(p.freshness)) return null
  if (typeof p.updated_at !== 'string') return null
  return {
    x_m: p.x_m,
    y_m: p.y_m,
    z_m: isFiniteNumber(p.z_m) ? p.z_m : 0,
    heading_deg: p.heading_deg,
    provider: p.provider as RobotPosition['provider'],
    quality: p.quality as RobotPosition['quality'],
    accuracy_m: isFiniteNumber(p.accuracy_m) ? p.accuracy_m : null,
    freshness: p.freshness as RobotPosition['freshness'],
    updated_at: p.updated_at,
  }
}

/**
 * Where the robot is, from one telemetry frame.
 *
 * The bridge's own position (AMCL's map pose under tap-to-walk, its
 * dead-reckoning estimate otherwise) when the frame carries a well-formed one;
 * raw odometry labelled dead_reckoning for a bridge older than schema 0.0.15.
 * A malformed position is treated as absent rather than trusted: it would
 * otherwise put the robot at NaN, or claim a map position it does not have.
 */
export function positionFromFrame(frame: FramePositionInput, lastHeadingDeg: number | undefined): RobotPosition {
  const fromBridge = readPosition(frame.position)
  if (fromBridge) return fromBridge
  const [x, y, z] = frame.pos_body
  return {
    x_m: x,
    y_m: y,
    z_m: z,
    // Body yaw, as the bridge's position_provider uses it. A frame without
    // ori_body (an older bridge) keeps the last known heading.
    heading_deg: frame.ori_body ? headingFromYaw(frame.ori_body[2]) : lastHeadingDeg ?? 0,
    provider: 'dead_reckoning',
    // Raw odometry carries no quality signal: 'estimated' is the honest label
    // for a dead-reckoned position, not a placeholder.
    quality: 'estimated',
    accuracy_m: null,
    freshness: frame.grpc_freshness,
    updated_at: frame.captured_at,
  }
}

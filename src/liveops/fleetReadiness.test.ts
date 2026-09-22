import { describe, expect, it } from 'vitest'
import { getFleetReadiness } from './fleetReadiness'
import type { RobotState } from '@/types'

function robot(overrides: Partial<RobotState> = {}): RobotState {
  return {
    robot_id: 'robot-dev-01', name: 'Rover 1', site_id: 'site-dev', robot_type: 'quad',
    abstract_state: 'STAND', posture: 'upright', sdk_state: 'balance_stand',
    battery: { percent: 80, est_runtime_min: 60, charging: false },
    position: {
      x_m: 0, y_m: 0, z_m: 0, heading_deg: 0,
      provider: 'dead_reckoning', quality: 'estimated', accuracy_m: null,
      freshness: 'live', updated_at: '',
    },
    speed_mps: 0, speed_ratio: 50, gait: 'walk', obstacle_avoidance: true,
    connectivity: { bridge_state: 'connected', grpc: 'connected', dds: 'connected', bridge_latency_ms: null },
    maintenance_flagged: false, updated_at: '',
    ...overrides,
  } as RobotState
}

describe('getFleetReadiness battery handling', () => {
  it('is ready with a healthy battery', () => {
    expect(getFleetReadiness(robot()).ready).toBe(true)
  })

  it('is not ready below the dispatch threshold', () => {
    const result = getFleetReadiness(robot({ battery: { percent: 12, est_runtime_min: 5, charging: false } }))
    expect(result.ready).toBe(false)
    expect(result.failing.some((f) => f.includes('below dispatch threshold'))).toBe(true)
  })

  it('is not ready when the battery level is unknown, and says so distinctly', () => {
    // An unknown battery must not silently pass readiness (a null compared with
    // `<` is false in JS, so the old check waved it straight through), and must
    // not be reported as "below threshold" either — the operator needs to know
    // the reading is missing, not that it is low.
    // See docs/audit/2026-08-12-prd-vs-sdk-direction-audit.md F1.
    const result = getFleetReadiness(robot({ battery: { percent: null, est_runtime_min: 0, charging: false } }))
    expect(result.ready).toBe(false)
    expect(result.failing.some((f) => f.toLowerCase().includes('unknown'))).toBe(true)
    expect(result.failing.some((f) => f.includes('below dispatch threshold'))).toBe(false)
  })
})

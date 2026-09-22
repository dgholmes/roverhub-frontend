import { describe, expect, it } from 'vitest'
import { fleetSortPriority, getFleetReadiness } from './fleetReadiness'
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

describe('a fallen robot is visible from the fleet list', () => {
  // Restores a signal the fall-recovery change removed. While `recovery`
  // mapped to FAULT, a downed robot was a fault everywhere: it sorted to the
  // top of the Fleet table and failed readiness. It now reports
  // MANUAL/ASSISTED, so posture has to carry that on its own.
  it('is not ready when fallen, and says so distinctly', () => {
    const result = getFleetReadiness(robot({ posture: 'fallen' }))
    expect(result.ready).toBe(false)
    expect(result.failing.some((f) => f.toLowerCase().includes('fallen'))).toBe(true)
  })

  it('is not ready when fallen even in an otherwise dispatchable state', () => {
    // STAND + healthy battery + every link up: readiness would be green on
    // every other factor, so posture is the only thing that can fail it.
    const result = getFleetReadiness(robot({ abstract_state: 'STAND', posture: 'fallen' }))
    expect(result.ready).toBe(false)
    expect(result.failing).toEqual(['Fallen — needs recovery'])
  })

  it('sorts a fallen robot level with a fault, above ordinary motion', () => {
    const fallen = fleetSortPriority({ abstract_state: 'MANUAL', posture: 'fallen' })
    expect(fallen).toBe(fleetSortPriority({ abstract_state: 'FAULT', posture: 'upright' }))
    expect(fallen).toBeLessThan(fleetSortPriority({ abstract_state: 'MANUAL', posture: 'upright' }))
  })

  it('never sorts a fallen robot below E-Stop, which still outranks it', () => {
    expect(fleetSortPriority({ abstract_state: 'E_STOP', posture: 'fallen' }))
      .toBeLessThan(fleetSortPriority({ abstract_state: 'MANUAL', posture: 'fallen' }))
  })

  it('leaves ordering unchanged for upright robots', () => {
    expect(fleetSortPriority({ abstract_state: 'PASSIVE', posture: 'upright' }))
      .toBeGreaterThan(fleetSortPriority({ abstract_state: 'STAND', posture: 'upright' }))
  })
})

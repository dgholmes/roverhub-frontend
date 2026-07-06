import type { RobotState } from '@/legacy/liveops-v1/types'

/**
 * Shaped like a cloud REST/WS payload (snake_case, ISO timestamps), never like
 * a raw SDK call — the frontend only ever talks to the cloud backend.
 */
export const initialRobots: RobotState[] = [
  {
    robot_id: 'zaezae-x1-001',
    name: 'RVR-01 "Atlas"',
    site_id: 'site-north-yard',
    abstract_state: 'AUTO_MISSION',
    sdk_state: 'MOTION_FLYING_TROT', // never rendered — proves the SDK boundary
    battery: { percent: 78, est_runtime_min: 168, charging: false },
    position: {
      x_m: 34.2, y_m: -12.7, heading_deg: 118,
      provider: 'dead_reckoning', freshness: 'live',
      updated_at: new Date().toISOString(),
    },
    speed_mps: 1.2,
    gait: 'walk',
    obstacle_avoidance: true,
    connectivity: {
      robot_to_edge: 'connected',
      edge_to_cloud: 'connected',
      bridge_state: 'connected',
      bridge_latency_ms: 42,
      dds: 'connected',
      grpc: 'connected',
    },
    maintenance_flagged: false,
    updated_at: new Date().toISOString(),
  },
  {
    robot_id: 'zaezae-x1-002',
    name: 'RVR-02 "Rex"',
    site_id: 'site-north-yard',
    abstract_state: 'STAND',
    sdk_state: 'MOTION_BALANCE_STAND',
    battery: { percent: 94, est_runtime_min: 260, charging: false },
    position: {
      x_m: 2.0, y_m: 1.0, heading_deg: 0,
      provider: 'dead_reckoning', freshness: 'live',
      updated_at: new Date().toISOString(),
    },
    speed_mps: 0,
    gait: 'walk',
    obstacle_avoidance: true,
    connectivity: {
      robot_to_edge: 'connected',
      edge_to_cloud: 'connected',
      bridge_state: 'connected',
      bridge_latency_ms: 28,
      dds: 'connected',
      grpc: 'connected',
    },
    maintenance_flagged: false,
    updated_at: new Date().toISOString(),
  },
  {
    robot_id: 'zaezae-x1-003',
    name: 'RVR-03 "Bolt"',
    site_id: 'site-north-yard',
    abstract_state: 'FAULT',
    sdk_state: 'FAULT_MOTOR_OVERCURRENT',
    battery: { percent: 22, est_runtime_min: 34, charging: false },
    position: {
      x_m: 55, y_m: 15, heading_deg: 200,
      provider: 'dead_reckoning', freshness: 'stale',
      updated_at: new Date(Date.now() - 15 * 60_000).toISOString(),
    },
    speed_mps: 0,
    gait: 'walk',
    obstacle_avoidance: true,
    connectivity: {
      robot_to_edge: 'connected',
      edge_to_cloud: 'connected',
      bridge_state: 'connected',
      bridge_latency_ms: 58,
      dds: 'unavailable',
      grpc: 'connected',
    },
    maintenance_flagged: true,
    updated_at: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
]

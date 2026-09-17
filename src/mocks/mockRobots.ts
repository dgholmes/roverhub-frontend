import type { RobotState } from '@/types'

/**
 * Shaped like a cloud REST/WS payload (snake_case, ISO timestamps), never like
 * a raw SDK call — the frontend only ever talks to the cloud backend.
 */
export const initialRobots: RobotState[] = [
  {
    robot_id: 'zaezae-x1-001',
    name: 'RVR-01 "Atlas"',
    site_id: 'site-north-yard',
    robot_type: 'quad',
    abstract_state: 'AUTO_MISSION',
    sdk_state: 'MOTION_FLYING_TROT', // never rendered — proves the SDK boundary
    battery: { percent: 78, est_runtime_min: 168, charging: false },
    position: {
      x_m: 34.2, y_m: -12.7, z_m: 0, heading_deg: 118,
      provider: 'dead_reckoning', quality: 'estimated', accuracy_m: null,
      freshness: 'live',
      updated_at: new Date().toISOString(),
    },
    speed_mps: 1.2,
    speed_ratio: 60,
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
    control_owner: null,
    available_motions: [
      'backflip', 'balance_height', 'balance_neutral', 'balance_pitch', 'balance_roll',
      'balance_stand', 'balance_yaw', 'change_mode', 'choreo', 'dance0', 'dynamic_pose',
      'flying_trot', 'flying_trot_velocity_seq', 'jump', 'line_walk', 'passive', 'ready',
      'recovery', 'rl', 'rl_velocity_seq', 'rotation', 'stand_down', 'static_pose', 'walk',
      'walk_velocity_seq', 'wave',
    ],
    updated_at: new Date().toISOString(),
  },
  {
    robot_id: 'zaezae-x1-002',
    name: 'RVR-02 "Rex"',
    site_id: 'site-north-yard',
    robot_type: 'quad',
    abstract_state: 'STAND',
    sdk_state: 'MOTION_BALANCE_STAND',
    battery: { percent: 94, est_runtime_min: 260, charging: false },
    position: {
      x_m: 2.0, y_m: 1.0, z_m: 0, heading_deg: 0,
      provider: 'dead_reckoning', quality: 'estimated', accuracy_m: null,
      freshness: 'live',
      updated_at: new Date().toISOString(),
    },
    speed_mps: 0,
    speed_ratio: 60,
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
    control_owner: null,
    available_motions: [
      'backflip', 'balance_height', 'balance_neutral', 'balance_pitch', 'balance_roll',
      'balance_stand', 'balance_yaw', 'change_mode', 'choreo', 'dance0', 'dynamic_pose',
      'flying_trot', 'flying_trot_velocity_seq', 'jump', 'line_walk', 'passive', 'ready',
      'recovery', 'rl', 'rl_velocity_seq', 'rotation', 'stand_down', 'static_pose', 'walk',
      'walk_velocity_seq', 'wave',
    ],
    updated_at: new Date().toISOString(),
  },
  {
    // The wheel-leg (miniQuadW) variant, so the wheel-specific UI paths --
    // Stand -> wheel_loco, the single-gait picker, the drift/climb/handstand
    // quick actions, hidden Balance diagnostics -- are exercisable from mocks
    // without hardware. available_motions below is the exact 12-motion set a
    // real miniQuadW reported from get_motions() on 2026-08-04.
    robot_id: 'zaezae-x1-003',
    name: 'RVR-03 "Bolt"',
    site_id: 'site-north-yard',
    robot_type: 'wheel',
    abstract_state: 'STAND',
    sdk_state: 'wheel_loco',
    battery: { percent: 22, est_runtime_min: 34, charging: false },
    position: {
      x_m: 55, y_m: 15, z_m: 0, heading_deg: 200,
      provider: 'dead_reckoning', quality: 'estimated', accuracy_m: null,
      freshness: 'stale',
      updated_at: new Date(Date.now() - 15 * 60_000).toISOString(),
    },
    speed_mps: 0,
    speed_ratio: 60,
    gait: 'wheel_loco',
    obstacle_avoidance: true,
    connectivity: {
      robot_to_edge: 'connected',
      edge_to_cloud: 'connected',
      bridge_state: 'connected',
      bridge_latency_ms: 58,
      dds: 'reconnecting',
      grpc: 'connected',
    },
    maintenance_flagged: true,
    control_owner: null,
    available_motions: [
      'change_mode', 'climb', 'drift', 'handstand', 'kill_robot', 'line_walk',
      'passive', 'ready', 'rotation', 'stand_down', 'wheel_loco',
      'wheel_loco_velocity_seq',
    ],
    updated_at: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
]

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
    posture: 'upright',
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
    bridge: {
      bridge_id: 'bridge-01',
      schema_version: '0.0.8',
      last_heartbeat_at: new Date().toISOString(),
      mission_active: true,
    },
    // Sample DDS lower_state so Fleet's motor view can be reviewed without
    // hardware. Motors 7 and 12 run warm on purpose.
    lowerState: {
      imu: {
        quaternion: [0.996, 0.01, -0.02, 0.087],
        gyroscope: [0.01, -0.02, 0.15],
        accelerometer: [0.1, -0.05, 9.79],
        rpy: [0.02, -0.04, 2.06],
      },
      motors: [
      { mode: 10, q: -0.1, dq: 0, ddq: 0, tau_est: 1.2, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 34 },
      { mode: 10, q: 0.0, dq: 0, ddq: 0, tau_est: 1.5, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 36 },
      { mode: 10, q: 0.1, dq: 0, ddq: 0, tau_est: 1.8, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 41 },
      { mode: 10, q: -0.1, dq: 0, ddq: 0, tau_est: 2.1, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 38 },
      { mode: 10, q: 0.0, dq: 0, ddq: 0, tau_est: 1.2, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 35 },
      { mode: 10, q: 0.1, dq: 0, ddq: 0, tau_est: 1.5, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 37 },
      { mode: 10, q: -0.1, dq: 0, ddq: 0, tau_est: 1.8, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 52 },
      { mode: 10, q: 0.0, dq: 0, ddq: 0, tau_est: 2.1, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 44 },
      { mode: 10, q: 0.1, dq: 0, ddq: 0, tau_est: 1.2, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 33 },
      { mode: 10, q: -0.1, dq: 0, ddq: 0, tau_est: 1.5, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 36 },
      { mode: 10, q: 0.0, dq: 0, ddq: 0, tau_est: 1.8, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 39 },
      { mode: 10, q: 0.1, dq: 0, ddq: 0, tau_est: 2.1, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 58 },
      { mode: 10, q: -0.1, dq: 0, ddq: 0, tau_est: 1.2, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 31 },
      { mode: 10, q: 0.0, dq: 0, ddq: 0, tau_est: 1.5, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 30 },
      { mode: 10, q: 0.1, dq: 0, ddq: 0, tau_est: 1.8, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 32 },
      { mode: 10, q: -0.1, dq: 0, ddq: 0, tau_est: 2.1, q_raw: 0, dq_raw: 0, ddq_raw: 0, motor_temp: 31 },
      ],
      battery_level: 78,
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
    posture: 'upright',
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
    bridge: {
      bridge_id: 'bridge-02',
      schema_version: '0.0.8',
      last_heartbeat_at: new Date().toISOString(),
      mission_active: false,
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
    posture: 'upright',
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
    bridge: {
      bridge_id: 'bridge-03',
      schema_version: '0.0.7',
      last_heartbeat_at: new Date(Date.now() - 15 * 60_000).toISOString(),
      mission_active: false,
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
  {
    // The fallen robot, so the fall-recovery UI is reachable without hardware:
    // LiveOps' contextual Get Up button (PostureButtons), the Fleet table's
    // "Fallen" marker, and the fleet-sort rule that lifts it to the top.
    // Deliberately a quad -- `recovery` is in quad's validStates and not in
    // wheel's, so the same posture on RVR-03 correctly shows nothing.
    // Added as a fourth robot rather than by flipping an existing one:
    // commandPolicy.test.ts builds every fixture from initialRobots[1].
    robot_id: 'zaezae-x1-004',
    name: 'RVR-04 "Scout"',
    site_id: 'site-north-yard',
    robot_type: 'quad',
    // MANUAL, not FAULT: `recovery` is ordinary motion now, which is exactly
    // why the fleet-level signal has to come from posture instead of state.
    abstract_state: 'MANUAL',
    posture: 'fallen',
    sdk_state: 'walk',
    battery: { percent: 61, est_runtime_min: 120, charging: false },
    position: {
      x_m: -8.4, y_m: 22.1, z_m: 0, heading_deg: 305,
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
      bridge_latency_ms: 37,
      dds: 'connected',
      grpc: 'connected',
    },
    bridge: {
      bridge_id: 'bridge-04',
      schema_version: '0.0.8',
      last_heartbeat_at: new Date().toISOString(),
      mission_active: false,
    },
    maintenance_flagged: false,
    control_owner: 'operator-dev',
    available_motions: [
      'backflip', 'balance_height', 'balance_neutral', 'balance_pitch', 'balance_roll',
      'balance_stand', 'balance_yaw', 'change_mode', 'choreo', 'dance0', 'dynamic_pose',
      'flying_trot', 'flying_trot_velocity_seq', 'jump', 'line_walk', 'passive', 'ready',
      'recovery', 'rl', 'rl_velocity_seq', 'rotation', 'stand_down', 'static_pose', 'walk',
      'walk_velocity_seq', 'wave',
    ],
    updated_at: new Date().toISOString(),
  },
]

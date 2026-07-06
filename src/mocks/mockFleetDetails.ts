import type { FleetRobotDetail } from '@/types'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

export const mockFleetDetails: Record<string, FleetRobotDetail> = {
  'zaezae-x1-001': {
    robot_id: 'zaezae-x1-001',
    serial: 'RVR01-A7C9-2026',
    edge_bridge_id: 'bridge-01',
    firmware_version: 'x1-fw-3.2.1',
    sdk_version: 'dobot-quad-sdk-1.8.0',
    battery_cycles: 142,
    bms_state: 'nominal',
    motor_warnings: [],
    sensors: [
      { sensor: 'rgb_camera', label: 'RGB Camera', state: 'ok' },
      { sensor: 'depth_camera', label: 'Depth Camera', state: 'ok' },
      { sensor: 'imu', label: 'IMU', state: 'ok' },
      { sensor: 'motor', label: 'Motors', state: 'ok' },
      { sensor: 'led', label: 'LED', state: 'ok' },
      { sensor: 'voice', label: 'Voice / Speaker', state: 'ok' },
    ],
    maintenance_log: [
      { id: 'maint-1a', opened_at: ago(60 * 24 * 3), severity: 'info', subsystem: 'Firmware', note: 'Updated to x1-fw-3.2.1', resolved: true },
      { id: 'maint-1b', opened_at: ago(60 * 24 * 1), severity: 'warning', subsystem: 'Battery', note: 'Battery cycle count approaching service interval (150 cycles).', resolved: false },
    ],
  },
  'zaezae-x1-002': {
    robot_id: 'zaezae-x1-002',
    serial: 'RVR02-B3D1-2026',
    edge_bridge_id: 'bridge-02',
    firmware_version: 'x1-fw-3.2.1',
    sdk_version: 'dobot-quad-sdk-1.8.0',
    battery_cycles: 58,
    bms_state: 'nominal',
    motor_warnings: [],
    sensors: [
      { sensor: 'rgb_camera', label: 'RGB Camera', state: 'ok' },
      { sensor: 'depth_camera', label: 'Depth Camera', state: 'ok' },
      { sensor: 'imu', label: 'IMU', state: 'ok' },
      { sensor: 'motor', label: 'Motors', state: 'ok' },
      { sensor: 'led', label: 'LED', state: 'ok' },
      { sensor: 'voice', label: 'Voice / Speaker', state: 'ok' },
    ],
    maintenance_log: [],
  },
  'zaezae-x1-003': {
    robot_id: 'zaezae-x1-003',
    serial: 'RVR03-C81E-2025',
    edge_bridge_id: 'bridge-03',
    firmware_version: 'x1-fw-3.1.9',
    sdk_version: 'dobot-quad-sdk-1.8.0',
    battery_cycles: 311,
    bms_state: 'warning',
    motor_warnings: ['Rear-left actuator overcurrent — motion halted'],
    sensors: [
      { sensor: 'rgb_camera', label: 'RGB Camera', state: 'ok' },
      { sensor: 'depth_camera', label: 'Depth Camera', state: 'degraded', detail: 'DDS unavailable — feed paused' },
      { sensor: 'imu', label: 'IMU', state: 'degraded', detail: 'DDS unavailable — stale readings' },
      { sensor: 'motor', label: 'Motors', state: 'fault', detail: 'Rear-left actuator overcurrent' },
      { sensor: 'led', label: 'LED', state: 'ok' },
      { sensor: 'voice', label: 'Voice / Speaker', state: 'ok' },
    ],
    maintenance_log: [
      { id: 'maint-3a', opened_at: ago(15), severity: 'critical', subsystem: 'Motor', note: 'Rear-left actuator overcurrent fault — robot halted, DDS link lost.', resolved: false },
      { id: 'maint-3b', opened_at: ago(60 * 24 * 5), severity: 'warning', subsystem: 'Battery', note: 'Battery cycle count exceeds recommended service interval (300 cycles).', resolved: false },
    ],
  },
}

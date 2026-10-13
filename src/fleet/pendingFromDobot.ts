/**
 * Fleet fields the robot's SDK does not expose today, kept on the page on
 * purpose and marked as pending rather than removed or filled with mock
 * values. Each points at the numbered question we have put to Dobot in
 * docs/09-ros2-slam-nav2-plan.md §7 — change the two together, so a badge
 * never cites a question that does not exist.
 */
export type PendingKey =
  | 'firmware' | 'serial' | 'components'
  | 'battery_cycles' | 'bms_state' | 'runtime' | 'charging'
  | 'joint_limits' | 'motor_temp_limits' | 'calibration' | 'firmware_update'
  | 'traffic' | 'foot_type' | 'led_health' | 'voice_health'
  | 'dock'

export interface PendingField {
  label: string
  /** Question number in docs/09-ros2-slam-nav2-plan.md §7. */
  question: number
  /** One line on what we asked, shown as the badge's tooltip. */
  asked: string
}

export const PENDING_FROM_DOBOT: Record<PendingKey, PendingField> = {
  firmware:          { label: 'Firmware version', question: 18, asked: 'Is there an API for the firmware version?' },
  serial:            { label: 'Serial number', question: 18, asked: 'Is the serial number readable over gRPC or DDS?' },
  components:        { label: 'Component versions', question: 18, asked: 'Can motor driver, BMS and camera versions be read?' },
  battery_cycles:    { label: 'Battery cycles', question: 19, asked: 'Does the BMS report a cycle count?' },
  bms_state:         { label: 'BMS state', question: 19, asked: 'Does the BMS report fault or warning flags, and what is battery_health?' },
  runtime:           { label: 'Time left', question: 19, asked: 'Is there a runtime estimate, or the current draw to compute one?' },
  charging:          { label: 'Charging', question: 17, asked: 'Can the Python binding expose battery_now_current?' },
  joint_limits:      { label: 'Joint limits', question: 20, asked: 'Are per-joint position and torque limits readable?' },
  motor_temp_limits: { label: 'Motor temperature limits', question: 20, asked: 'At what motor temperature does the robot warn or cut out?' },
  calibration:       { label: 'Calibration', question: 21, asked: 'Can calibration be started and its result read remotely?' },
  firmware_update:   { label: 'Firmware update', question: 22, asked: 'Is there a remote firmware update with progress?' },
  traffic:           { label: 'Mobile data', question: 23, asked: 'Can the robot report its 4G data usage?' },
  foot_type:         { label: 'Foot type', question: 24, asked: 'Can the fitted foot be read, beyond the robot type?' },
  led_health:        { label: 'LED health', question: 25, asked: 'Can the LED controller report a fault?' },
  voice_health:      { label: 'Speaker and mic health', question: 25, asked: 'Can the speaker and microphone report a fault?' },
  dock:              { label: 'Charging dock', question: 26, asked: 'What will the dock report: presence, docking, last used, charge current?' },
}

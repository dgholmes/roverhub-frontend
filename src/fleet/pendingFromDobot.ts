import i18n from '@/i18n'

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

/** Question numbers; the label and question text come from the
 * fleetDetail.pending dictionary, in the current language. */
const QUESTION: Record<PendingKey, number> = {
  firmware: 18,
  serial: 18,
  components: 18,
  battery_cycles: 19,
  bms_state: 19,
  runtime: 19,
  charging: 17,
  joint_limits: 20,
  motor_temp_limits: 20,
  calibration: 21,
  firmware_update: 22,
  traffic: 23,
  foot_type: 24,
  led_health: 25,
  voice_health: 25,
  dock: 26,
}

function field(key: PendingKey): PendingField {
  return {
    get label() { return i18n.t(`fleetDetail.pending.${key}.label`) },
    question: QUESTION[key],
    get asked() { return i18n.t(`fleetDetail.pending.${key}.asked`) },
  }
}

export const PENDING_FROM_DOBOT = Object.fromEntries(
  (Object.keys(QUESTION) as PendingKey[]).map((k) => [k, field(k)]),
) as Record<PendingKey, PendingField>

import type { TFunction } from 'i18next'
import { navStopReasonText } from '@/liveops/navGoal'

/**
 * The edge bridge's refusals, in words.
 *
 * The bridge refuses a command with a code -- bare from its safety gate
 * (`REJECTED_ESTOP`), or with a detail after a colon
 * (`REJECTED_NAV_MAP_MISMATCH: the point is on map 'a' but ...`). The detail is
 * for engineers and is in English; the code picks the operator's words. This
 * is the one table for them: the command toast, the Logs line, Fleet's tests
 * and a mission run's end reason all read it (runText.runReasonText).
 *
 * Every code the bridge source contains must be here; refusals.test.ts reads
 * the bridge to check. The table may run ahead of the bridge: a code added
 * here before the bridge sends it costs nothing. A code this build does not know reads as "the robot
 * refused this command" with the code beside it, never as nothing.
 */
export const REFUSAL_CODES = [
  // Battery (safety_manager battery tiers)
  'REJECTED_BATTERY_CRITICAL', 'REJECTED_BATTERY_UNKNOWN', 'REJECTED_LOW_BATTERY', 'REJECTED_ROBOT_LYING_DOWN',
  // E-Stop, posture, passive
  'REJECTED_ESTOP', 'REJECTED_PASSIVE_IS_ESTOP', 'REJECTED_ROBOT_IN_PASSIVE', 'REJECTED_ROBOT_FALLEN', 'REJECTED_ROBOT_FAULT',
  'REJECTED_ROBOT_STATE_STALE',
  // Control
  'REJECTED_NOT_CONTROL_OWNER', 'REJECTED_CONTROL_HELD', 'REJECTED_MISSION_HOLDS_CONTROL',
  // Missions
  'REJECTED_RUN_ACTIVE', 'REJECTED_NO_STEPS', 'REJECTED_INVALID_PROGRAM', 'REJECTED_STOPPED', 'REJECTED_NOT_ALLOWED_IN_MISSION',
  'REJECTED_BLIND_MOTION', 'REJECTED_NOT_BLOCKED',
  // Delivery
  'REJECTED_EXPIRED',
  // What this robot can do
  'REJECTED_UNSUPPORTED_ON_WHEEL', 'REJECTED_STATE_UNSUPPORTED', 'REJECTED_GAIT_UNSUPPORTED', 'REJECTED_INVALID_PARAMS',
  'REJECTED_NO_CONNECTION',
  // Walk to a point (nav) and Set position
  'REJECTED_NAV_DISABLED', 'REJECTED_NAV_UNAVAILABLE', 'REJECTED_NAV_NO_MAP', 'REJECTED_NAV_MAP_MISMATCH',
  'REJECTED_NAV_ZONES_NOT_LOADED', 'REJECTED_NAV_GOAL_IN_NO_GO_ZONE', 'REJECTED_NAV_GOAL_OUTSIDE_GEOFENCE', 'REJECTED_NAV_GOAL_ZONE',
  'REJECTED_NAV_REFUSED', 'REJECTED_NAV_CANCELLED', 'REJECTED_NAV_SUPERSEDED', 'REJECTED_NAV_ENDED', 'REJECTED_NAV_GOAL_ACTIVE',
  'REJECTED_NAV2_NO_RESPONSE', 'REJECTED_NAV2_REJECTED', 'REJECTED_POSITION_UNAVAILABLE', 'REJECTED_NO_ODOMETRY',
  'REJECTED_NOT_LOCALISED',
] as const
export type RefusalCode = (typeof REFUSAL_CODES)[number]

const isRefusalCode = (code: string): code is RefusalCode => (REFUSAL_CODES as readonly string[]).includes(code)

/** "REJECTED_X: detail", or the bare code. Only `REJECTED_` codes: a run's
 * own end reasons (`lowBattery`) and the console's own failure text are not
 * bridge refusals. */
const CODED = /^(REJECTED_[A-Z0-9_]+)(?::\s*([\s\S]*))?$/

/** Codes whose detail is what the operator needs to fix it (what is invalid),
 * shown after the words. Every other detail stays in the raw text. */
const DETAIL_SHOWN = new Set<RefusalCode>(['REJECTED_INVALID_PROGRAM', 'REJECTED_INVALID_PARAMS'])

export interface Refusal {
  /** The code as sent, known or not. */
  code: string
  /** Whether this build has words for it. When not, show `code` beside `text`. */
  known: boolean
  /** The operator's words: a clause, as `{{reason}}` in the surrounding strings takes it. */
  text: string
  /** Exactly what the bridge sent, for a title or a log detail. */
  raw: string
}

/** A bridge refusal in words, or null when `raw` is not one. */
export function refusalOf(t: TFunction, raw: string): Refusal | null {
  const m = CODED.exec(raw.trim())
  if (!m) return null
  const [, code, rawDetail] = m
  const detail = rawDetail?.trim() ?? ''
  if (!isRefusalCode(code)) return { code, known: false, text: t('command.refusal.unknown'), raw }
  let text: string = t(`command.refusal.code.${code}`)
  if (code === 'REJECTED_NAV_REFUSED') {
    // The detail is the nav supervisor's own stop reason, already worded for the walk bar.
    const reason = detail ? navStopReasonText(detail) : null
    if (reason) text = t('command.refusal.navRefusedBecause', { reason })
  } else if (code === 'REJECTED_NAV_GOAL_IN_NO_GO_ZONE' && detail) {
    // The detail is the zone's label, which the operator drew.
    text = t('command.refusal.inNoGoZoneNamed', { zone: detail })
  } else if (DETAIL_SHOWN.has(code) && detail) {
    text = t('command.refusal.withDetail', { text, detail })
  }
  return { code, known: true, text, raw }
}

/** A failure reason as one line of text: a bridge refusal in words (with the
 * code in brackets when this build has none), anything else as it came. For
 * places that show a plain string; a component can use refusalOf and show the
 * code as secondary text instead. */
export function refusalText(t: TFunction, raw: string): string {
  const r = refusalOf(t, raw)
  if (!r) return raw
  return r.known ? r.text : t('command.refusal.unknownWithCode', { code: r.code })
}

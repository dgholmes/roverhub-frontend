import type { TFunction } from 'i18next'
import i18n from '@/i18n'
import type { RunReason } from '@/missions/program/runReasons'
import type { DryRunWarning } from '@/missions/program/dryRun'
import { LIMITS } from '@/missions/program/types'

/** A run's stop reason in the current language (RUN_REASON_TEXT is the English for records). */
export function reasonText(t: TFunction, reason: RunReason): string {
  return t(`missions.program.run.reason.${reason}`, {
    max: reason === 'repeatUntilLimit' ? LIMITS.maxRepeatUntil : reason === 'stepLimit' ? LIMITS.maxStepsPerRun : LIMITS.maxCommandsPerRun,
    seconds: LIMITS.waitUntilSeconds,
  })
}

/** An edge refusal as the bridge sends it in an ack's failure_reason, and as
 * the backend copies it into a run's end_reason: "REJECTED_X: message" -- or the bare code, from the bridge's safety gate. */
const CODED_REASON = /^([A-Z][A-Z0-9_]+)(?::\s*([\s\S]*))?$/

/** The codes with a translation (missions.program.run.startRefusal). The rest
 * carry detail in their message (who holds control, what is invalid), which
 * is shown instead. */
const TRANSLATED_CODES = ['REJECTED_RUN_ACTIVE', 'REJECTED_NO_STEPS', 'REJECTED_ESTOP', 'REJECTED_ROBOT_FAULT', 'REJECTED_ROBOT_FALLEN',
  'REJECTED_BATTERY_UNKNOWN', 'REJECTED_LOW_BATTERY', 'REJECTED_BATTERY_CRITICAL', 'REJECTED_NOT_CONTROL_OWNER', 'REJECTED_ROBOT_IN_PASSIVE', 'REJECTED_NO_CONNECTION'] as const
type TranslatedCode = (typeof TRANSLATED_CODES)[number]
const isTranslatedCode = (code: string): code is TranslatedCode => (TRANSLATED_CODES as readonly string[]).includes(code)

/** An untranslated bare code, readably: REJECTED_SOMETHING_NEW -> "something new". */
const readableCode = (code: string) => code.replace(/^REJECTED_/, '').replace(/_/g, ' ').toLowerCase() || code

/** A reason from the wire: translated when this build knows the key, else shown
 * as sent. A coded edge refusal is translated by its code when this build knows
 * it, else shown without the code. */
export function runReasonText(t: TFunction, reason: string): string {
  const coded = CODED_REASON.exec(reason)
  if (coded) {
    const code = coded[1]
    return isTranslatedCode(code) ? t(`missions.program.run.startRefusal.${code}`) : coded[2] || readableCode(code)
  }
  return i18n.exists(`missions.program.run.reason.${reason}`) ? reasonText(t, reason as RunReason) : reason
}

export function dryWarningText(t: TFunction, w: DryRunWarning): string {
  return t(`missions.program.run.dryWarning.${w.code}`, {
    label: w.label ?? '',
    seconds: LIMITS.waitUntilSeconds,
    max: LIMITS.maxCommandsPerRun,
  })
}

/** "40 s", "1 min 40 s". */
export function secondsText(t: TFunction, seconds: number): string {
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? t('missions.program.run.time.ms', { m, s }) : t('missions.program.run.time.s', { s })
}

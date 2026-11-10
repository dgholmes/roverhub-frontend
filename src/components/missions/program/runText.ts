import type { TFunction } from 'i18next'
import i18n from '@/i18n'
import type { RunReason } from '@/missions/program/runReasons'
import type { DryRunWarning } from '@/missions/program/dryRun'
import { LIMITS } from '@/missions/program/types'
import { refusalOf, refusalText } from '@/lib/refusals'

/** A run's stop reason in the current language (RUN_REASON_TEXT is the English for records). */
export function reasonText(t: TFunction, reason: RunReason): string {
  return t(`missions.program.run.reason.${reason}`, {
    max: reason === 'repeatUntilLimit' ? LIMITS.maxRepeatUntil : reason === 'stepLimit' ? LIMITS.maxStepsPerRun : LIMITS.maxCommandsPerRun,
    seconds: LIMITS.waitUntilSeconds,
  })
}

/** Another upper-case code on the wire that is not a bridge refusal (the
 * refusals themselves are lib/refusals.ts). Shown by its message, or readably. */
const CODED_REASON = /^([A-Z][A-Z0-9_]+)(?::\s*([\s\S]*))?$/
const readableCode = (code: string) => code.replace(/_/g, ' ').toLowerCase() || code

/** A reason from the wire. An edge refusal ("REJECTED_X: message", or the bare
 * code from the bridge's safety gate, as the backend copies it into a run's
 * end_reason) is worded from the one refusal table; a run's own reason is
 * translated when this build knows the key; anything else is shown as sent. */
export function runReasonText(t: TFunction, reason: string): string {
  if (refusalOf(t, reason)) return refusalText(t, reason)
  const coded = CODED_REASON.exec(reason)
  if (coded) return coded[2] || readableCode(coded[1])
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

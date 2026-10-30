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

/** A reason from the wire: translated when this build knows the key, else shown as sent. */
export function runReasonText(t: TFunction, reason: string): string {
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

import type { TFunction } from 'i18next'
import type { RunReason } from '@/missions/program/run'
import type { DryRunWarning } from '@/missions/program/dryRun'
import { LIMITS } from '@/missions/program/types'

/** A run's stop reason in the current language (RUN_REASON_TEXT is the English for records). */
export function reasonText(t: TFunction, reason: RunReason): string {
  return t(`missions.program.run.reason.${reason}`, {
    max: reason === 'repeatUntilLimit' ? LIMITS.maxRepeatUntil : reason === 'stepLimit' ? LIMITS.maxStepsPerRun : LIMITS.maxCommandsPerRun,
    seconds: LIMITS.waitUntilSeconds,
  })
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

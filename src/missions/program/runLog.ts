import type { TFunction } from 'i18next'
import { runReasonText } from '@/components/missions/program/runText'
import type { RunEvent } from '@/types'
import type { RunLogEntry, StepResult } from './runReasons'

/** One row of the run log on screen: a step from its start to its result, or a
 * pause, resume or end of the run. */
export interface RunLogLine {
  key: number
  at: number
  blockId: string | null
  label: string
  result: StepResult | 'running' | 'warning' | 'paused' | 'resumed'
  /** Why the step or the run ended, in the current language. */
  detail?: string
}

/** Fills a step's open row with its result, or adds a row if it never started. */
function close(lines: RunLogLine[], blockId: string | null, next: Omit<RunLogLine, 'key'> & { key: number }): RunLogLine[] {
  let open = lines.length - 1
  while (open >= 0 && !(lines[open].blockId === blockId && lines[open].result === 'running')) open--
  if (open < 0) return [...lines, next]
  const out = [...lines]
  out[open] = { ...out[open], result: next.result, ...(next.detail ? { detail: next.detail } : {}) }
  return out
}

/**
 * Folds a dry-run entry into the log. A step's start opens a row and its
 * result fills that row in, so each step reads as one line; a container
 * (repeat, if) stays "running" while its body runs below it.
 */
export function addLogEntry(lines: RunLogLine[], e: RunLogEntry, key: number): RunLogLine[] {
  if (e.result === 'started') return [...lines, { key, at: e.at, blockId: e.blockId, label: e.label, result: 'running' }]
  return close(lines, e.blockId, { key, at: e.at, blockId: e.blockId, label: e.label, result: e.result })
}

const STEP_RESULT: Partial<Record<RunEvent['kind'], StepResult>> = { step_done: 'done', step_failed: 'failed', step_skipped: 'skipped' }
const ENDED_RESULT = { completed: 'done', failed: 'failed', aborted: 'cancelled', running: 'cancelled' } as const

/**
 * The run log of an edge run, from its events: one row per step (started,
 * then done, failed or skipped), a row when the run pauses and resumes, one
 * per alert (its message, e.g. step events dropped), and one when it ends
 * with its reason. Events are taken in `seq` order and a
 * redelivered one (MQTT QoS 1) counts once.
 */
export function logLinesFromEvents(events: RunEvent[], t: TFunction): RunLogLine[] {
  const seen = new Set<number>()
  const ordered = [...events].sort((a, b) => a.seq - b.seq).filter((e) => !seen.has(e.seq) && seen.add(e.seq))
  let lines: RunLogLine[] = []
  for (const e of ordered) {
    const at = Date.parse(e.at)
    const detail = e.reason ? runReasonText(t, e.reason) : undefined
    const base = { key: e.seq, at, blockId: e.block_id, label: e.message ?? '', ...(detail ? { detail } : {}) }
    const stepResult = STEP_RESULT[e.kind]
    if (e.kind === 'step_started') lines = [...lines, { ...base, result: 'running' }]
    else if (stepResult) lines = close(lines, e.block_id, { ...base, result: stepResult })
    else if (e.kind === 'alert') lines = [...lines, { ...base, blockId: null, result: 'warning' }]
    else if (e.kind === 'paused') lines = [...lines, { ...base, blockId: null, label: t('missions.program.run.log.paused'), result: 'paused' }]
    else if (e.kind === 'resumed') lines = [...lines, { ...base, blockId: null, label: t('missions.program.run.log.resumed'), result: 'resumed' }]
    else if (e.kind === 'run_ended') {
      const result = e.result ?? 'aborted'
      lines = [...lines, { ...base, blockId: null, label: t(`missions.program.run.log.ended.${result === 'running' ? 'aborted' : result}`), result: ENDED_RESULT[result] }]
    }
  }
  return lines
}

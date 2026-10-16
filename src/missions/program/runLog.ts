import type { RunLogEntry, RunReason, StepResult } from './run'

/** One row of the run log on screen: a step, from its start to its result. */
export interface LogLine {
  key: number
  at: number
  blockId: string | null
  label: string
  result: StepResult | 'running' | 'warning'
  reason?: RunReason
}

/**
 * Folds a runner entry into the log. A step's start opens a row and its
 * result fills that row in, so each step reads as one line; a container
 * (repeat, if) stays "running" while its body runs below it.
 */
export function addLogEntry(lines: LogLine[], e: RunLogEntry, key: number): LogLine[] {
  if (e.result === 'started') return [...lines, { key, at: e.at, blockId: e.blockId, label: e.label, result: 'running' }]
  let open = lines.length - 1
  while (open >= 0 && !(lines[open].blockId === e.blockId && lines[open].result === 'running')) open--
  const filled: Partial<LogLine> = { result: e.result, ...(e.reason ? { reason: e.reason } : {}) }
  if (open < 0) return [...lines, { key, at: e.at, blockId: e.blockId, label: e.label, ...filled } as LogLine]
  const next = [...lines]
  next[open] = { ...next[open], ...filled }
  return next
}

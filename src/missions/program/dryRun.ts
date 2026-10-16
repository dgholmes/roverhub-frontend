import type { RobotState } from '@/types'
import { expectedDurationS } from '@/lib/realtime/commandDeadline'
import { evaluate, type RunLogEntry } from './run'
import { LIMITS, type Condition, type Step } from './types'

export type DryRunWarningCode =
  | 'batteryUnknown' | 'waitUntilUnresolved' | 'repeatUntilUnresolved'
  | 'conditionMissing' | 'commandLimit'

export interface DryRunWarning {
  code: DryRunWarningCode
  label?: string
}

export interface DryRunResult {
  log: RunLogEntry[]
  seconds: number
  metresWalked: number
  commands: number
  warnings: DryRunWarning[]
}

/** Walks the tree as the runner would, with every command succeeding. */
export function dryRun(steps: Step[], robot: RobotState | undefined): DryRunResult {
  const out: DryRunResult = { log: [], seconds: 0, metresWalked: 0, commands: 0, warnings: [] }
  let ratio: number | undefined = robot?.speed_ratio
  let truncated = false
  const warn = (code: DryRunWarningCode, label?: string) => {
    if (!out.warnings.some((w) => w.code === code && w.label === label)) out.warnings.push({ code, label })
  }
  const note = (s: { blockId: string; label: string }, result: RunLogEntry['result'], detail?: string) =>
    out.log.push({ at: out.seconds * 1000, blockId: s.blockId, label: s.label, result, detail })

  /** A missing condition ends the walk: a real run fails there. */
  const check = (c: Condition, label: string): boolean => {
    if (c.kind === 'batteryBelow' && typeof robot?.battery?.percent !== 'number') warn('batteryUnknown')
    if (c.kind === 'missing') {
      warn('conditionMissing', label)
      truncated = true
    }
    return evaluate(c, robot)
  }

  const walk = (list: Step[]) => {
    for (const step of list) {
      if (truncated) return
      switch (step.kind) {
        case 'command': {
          if (out.commands >= LIMITS.maxCommandsPerRun) {
            warn('commandLimit')
            truncated = true
            return
          }
          out.commands++
          note(step, 'done')
          if (step.type === 'SET_SPEED_RATIO' && typeof step.params.ratio === 'number') ratio = step.params.ratio
          out.seconds += expectedDurationS(step.type, step.params, ratio)
          if (step.type === 'LINE_WALK' && typeof step.params.distance === 'number') {
            out.metresWalked += Math.abs(step.params.distance)
          }
          break
        }
        case 'wait':
          note(step, 'done')
          out.seconds += step.seconds
          break
        case 'waitUntil':
          note(step, 'done')
          if (!check(step.condition, step.label) && !truncated) {
            // Upper bound: the real run gives up after the timeout.
            warn('waitUntilUnresolved', step.label)
            out.seconds += LIMITS.waitUntilSeconds
          }
          break
        case 'if':
          note(step, 'done')
          {
            const cond = check(step.condition, step.label)
            if (!truncated) walk(cond ? step.then : step.else)
          }
          break
        case 'repeat':
          note(step, 'done')
          for (let i = 0; i < Math.min(step.times, LIMITS.maxRepeat) && !truncated; i++) walk(step.body)
          break
        case 'repeatUntil':
          note(step, 'done')
          if (!check(step.condition, step.label) && !truncated) {
            warn('repeatUntilUnresolved', step.label)
            walk(step.body)
          }
          break
      }
    }
  }

  walk(steps)
  return out
}

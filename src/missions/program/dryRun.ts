import type { RobotState } from '@/types'
import { expectedDurationS } from '@/lib/realtime/commandDeadline'
import { evaluate, type RunLogEntry } from './run'
import { LIMITS, type Condition, type Step } from './types'

export interface DryRunResult {
  log: RunLogEntry[]
  seconds: number
  metresWalked: number
  commands: number
  warnings: string[]
}

/** Walks the tree as the runner would, with every command succeeding. */
export function dryRun(steps: Step[], robot: RobotState | undefined): DryRunResult {
  const out: DryRunResult = { log: [], seconds: 0, metresWalked: 0, commands: 0, warnings: [] }
  let ratio: number | undefined = robot?.speed_ratio
  let truncated = false
  const warn = (w: string) => {
    if (!out.warnings.includes(w)) out.warnings.push(w)
  }
  const note = (s: { blockId: string; label: string }, result: RunLogEntry['result'], detail?: string) =>
    out.log.push({ at: out.seconds * 1000, blockId: s.blockId, label: s.label, result, detail })

  const check = (c: Condition): boolean => {
    if (c.kind === 'batteryBelow' && typeof robot?.battery?.percent !== 'number') {
      warn('Battery level is unknown, so "battery below" counts as false.')
    }
    if (c.kind === 'missing') warn('A block has an empty condition.')
    return evaluate(c, robot)
  }

  const walk = (list: Step[]) => {
    for (const step of list) {
      if (truncated) return
      switch (step.kind) {
        case 'command': {
          if (out.commands >= LIMITS.maxCommandsPerRun) {
            warn(`More than ${LIMITS.maxCommandsPerRun} commands; a real run would stop there.`)
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
          if (!check(step.condition)) {
            warn(`"${step.label}" waits for a condition a dry run cannot change; a real run may wait up to ${LIMITS.waitUntilSeconds} s.`)
          }
          note(step, 'done')
          break
        case 'if':
          note(step, 'done')
          walk(check(step.condition) ? step.then : step.else)
          break
        case 'repeat':
          note(step, 'done')
          for (let i = 0; i < step.times && !truncated; i++) walk(step.body)
          break
        case 'repeatUntil':
          note(step, 'done')
          if (!check(step.condition)) {
            warn(`"${step.label}" repeats until a condition a dry run cannot change; the body is counted once.`)
            walk(step.body)
          }
          break
      }
    }
  }

  walk(steps)
  return out
}

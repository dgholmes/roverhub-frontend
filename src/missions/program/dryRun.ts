import type { RobotState } from '@/types'
import { expectedDurationS } from '@/lib/realtime/commandDeadline'
import type { RunLogEntry } from './runReasons'
import { LIMITS, NAV_STEP_DEFAULT_MAX_S, type Condition, type Step } from './types'

const STANDING_STATES = ['STAND', 'MANUAL', 'ASSISTED', 'AUTO_MISSION', 'RETURNING']

/** Whether a condition holds now, read from the robot's state. Unknown readings
 * are false, never compared. (The edge executor reads its own conditions on a
 * real run; this is the dry run's view.) */
export function evaluate(c: Condition, robot: RobotState | undefined): boolean {
  if (!robot) return false
  switch (c.kind) {
    case 'batteryBelow': {
      const pct = robot.battery?.percent
      return typeof pct === 'number' && pct < c.pct
    }
    case 'fallen':
      return robot.posture === 'fallen'
    case 'standing':
      return robot.posture !== 'fallen' && STANDING_STATES.includes(robot.abstract_state)
    case 'avoidanceOn':
      return robot.obstacle_avoidance === true
    case 'missing':
      return false
  }
}

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

  /**
   * With no robot there is nothing to decide an `if` by, and picking one
   * branch would under-report the run whenever the other is longer. Both are
   * finite, so the longer is a true upper bound: walk each from the same
   * start and keep the one that takes longer. Warnings from either branch
   * stay, because either could run.
   */
  const walkLongerBranch = (a: Step[], b: Step[]) => {
    const start = { seconds: out.seconds, metres: out.metresWalked, commands: out.commands, log: out.log.length, ratio, truncated }
    walk(a)
    const first = { seconds: out.seconds, metres: out.metresWalked, commands: out.commands, ratio, truncated, log: out.log.splice(start.log) }
    out.seconds = start.seconds; out.metresWalked = start.metres; out.commands = start.commands; ratio = start.ratio; truncated = start.truncated
    walk(b)
    if (first.seconds > out.seconds) {
      out.seconds = first.seconds; out.metresWalked = first.metres; out.commands = first.commands; ratio = first.ratio; truncated = first.truncated
      out.log.splice(start.log, out.log.length - start.log, ...first.log)
    }
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
        case 'navigate': {
          // A leg's time is the robot's walk, which only the robot knows; its
          // cap is the honest upper bound. It sends one NAV_GOTO.
          if (out.commands >= LIMITS.maxCommandsPerRun) {
            warn('commandLimit')
            truncated = true
            return
          }
          out.commands++
          note(step, 'done')
          out.seconds += step.maxSeconds ?? NAV_STEP_DEFAULT_MAX_S
          break
        }
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
            if (truncated) break
            if (robot) walk(cond ? step.then : step.else)
            else walkLongerBranch(step.then, step.else)
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
        default: {
          const unhandled: never = step
          void unhandled
        }
      }
    }
  }

  walk(steps)
  return out
}

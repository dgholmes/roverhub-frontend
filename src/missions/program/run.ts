import type { RobotState } from '@/types'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { LIMITS, type CommandStep, type Condition, type Step } from './types'

export type StepResult = 'done' | 'failed' | 'cancelled' | 'unknown' | 'skipped'

export interface RunLogEntry {
  at: number
  blockId: string
  label: string
  result: StepResult | 'started'
  /** Why the step ended the run, when it did. `detail` is its English text for records. */
  reason?: RunReason
  detail?: string
  /** A completed take-photo step: the snapshot it stored (set by the caller, not the runner). */
  snapshotId?: string
}

export interface RunnerEffects {
  /** Work a command needs before it is sent (a SPEAK step's clip). Stop and
   * the guards are checked again after it, since it can take a while. A
   * rejection fails the step without sending it. */
  prepare?(step: CommandStep): Promise<void>
  send(step: CommandStep): Promise<'completed' | 'failed' | 'cancelled' | 'unknown'>
  robot(): RobotState | undefined
  ownsControl(): boolean
  now(): number
  /** Rejects with an AbortError when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>
  log(entry: RunLogEntry): void
  highlight(blockId: string | null): void
}

/** Why a run stopped. The UI translates these; the English is the source wording. */
export type RunReason =
  | 'unreachable' | 'estop' | 'fault' | 'fallen' | 'controlLost' | 'poweredDown' | 'stopped'
  | 'commandFailed' | 'commandCancelled' | 'noAnswer'
  | 'repeatUntilLimit' | 'waitUntilTimeout' | 'commandLimit' | 'stepLimit' | 'conditionMissing'

export const RUN_REASON_TEXT: Record<RunReason, string> = {
  unreachable: 'robot unreachable',
  estop: 'E-Stop engaged',
  fault: 'robot fault',
  fallen: 'robot has fallen',
  controlLost: 'control was released',
  poweredDown: 'the robot powered down during the run (5 minutes without a command?)',
  stopped: 'stopped by the operator',
  commandFailed: 'command failed',
  commandCancelled: 'cancelled — E-Stop?',
  noAnswer: 'no answer from the robot; it may still be moving',
  repeatUntilLimit: `repeat-until ran ${LIMITS.maxRepeatUntil} times without its condition becoming true`,
  waitUntilTimeout: `wait-until timed out after ${LIMITS.waitUntilSeconds} s`,
  commandLimit: `more than ${LIMITS.maxCommandsPerRun} commands in one run`,
  stepLimit: `more than ${LIMITS.maxStepsPerRun} steps in one run`,
  conditionMissing: 'condition missing',
}

export type RunOutcome = {
  result: 'completed' | 'failed' | 'aborted'
  reason?: RunReason
  commandsSent: number
}

const STANDING_STATES = ['STAND', 'MANUAL', 'ASSISTED', 'AUTO_MISSION', 'RETURNING']
const POLL_MS = 500
/** SET_STATE targets that put the robot down on purpose (abstract PASSIVE). */
const LIE_DOWN_STATES = new Set(['ready', 'stand_down', 'passive'])

/** Whether a condition holds now. Unknown readings are false, never compared. */
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

/** The reason a command must not be sent right now, or null. `unknown` posture is not `fallen`. */
export function guardFailure(robot: RobotState | undefined, ownsControl: boolean): RunReason | null {
  if (!robot || reachabilityOf(robot) !== 'online') return 'unreachable'
  if (robot.abstract_state === 'E_STOP') return 'estop'
  if (robot.abstract_state === 'FAULT') return 'fault'
  if (robot.posture === 'fallen') return 'fallen'
  if (!ownsControl) return 'controlLost'
  return null
}

type Halt = { result: 'failed' | 'aborted'; reason: RunReason }

export async function runProgram(steps: Step[], fx: RunnerEffects, stop: AbortSignal): Promise<RunOutcome> {
  let commandsSent = 0
  let stepsRun = 0
  // The bridge powers the robot down (PASSIVE) and drops control after 300 s
  // without a command, and nothing on the wire says so. Once the robot has
  // been seen up during the run, PASSIVE before a later command means that
  // happened, unless the program itself last put the robot down.
  let seenUp = false
  let liedDown = false
  const watchPower = (robot: RobotState | undefined) => {
    if (!liedDown && robot && robot.abstract_state !== 'PASSIVE') seenUp = true
  }
  const commandGuard = (robot: RobotState | undefined): RunReason | null => {
    const guard = guardFailure(robot, fx.ownsControl())
    if (guard) return guard
    if (seenUp && robot?.abstract_state === 'PASSIVE') return 'poweredDown'
    watchPower(robot)
    return null
  }

  const note = (s: { blockId: string; label: string }, result: RunLogEntry['result'], reason?: RunReason) =>
    fx.log({ at: fx.now(), blockId: s.blockId, label: s.label, result, ...(reason ? { reason, detail: RUN_REASON_TEXT[reason] } : {}) })

  const halt = (
    s: { blockId: string; label: string },
    result: 'failed' | 'aborted',
    reason: RunReason,
    logAs: StepResult,
  ): Halt => {
    note(s, logAs, reason)
    return { result, reason }
  }

  /** Sleep that ends promptly on Stop. Returns false when stopped. */
  const nap = async (ms: number): Promise<boolean> => {
    if (stop.aborted) return false
    try {
      await fx.sleep(ms, stop)
      return !stop.aborted
    } catch (e) {
      if (stop.aborted) return false
      throw e
    }
  }

  async function runList(list: Step[]): Promise<Halt | null> {
    for (const step of list) {
      const h = await runStep(step)
      if (h) return h
    }
    return null
  }

  /** Every 200 steps/iterations, yield a macrotask so Stop stays clickable. Returns false when stopped. */
  let ticks = 0
  const yieldOften = async (): Promise<boolean> => (++ticks % 200 === 0 ? nap(0) : !stop.aborted)

  /** Counts a step or a loop iteration against the run's budget. */
  const overBudget = () => ++stepsRun > LIMITS.maxStepsPerRun

  async function runStep(step: Step): Promise<Halt | null> {
    if (!(await yieldOften())) return halt(step, 'aborted', 'stopped', 'skipped')
    if (overBudget()) return halt(step, 'failed', 'stepLimit', 'skipped')
    fx.highlight(step.blockId)
    switch (step.kind) {
      case 'command': {
        const guard = commandGuard(fx.robot())
        if (guard) return halt(step, 'aborted', guard, 'skipped')
        if (commandsSent >= LIMITS.maxCommandsPerRun) return halt(step, 'failed', 'commandLimit', 'skipped')
        note(step, 'started')
        if (fx.prepare) {
          try {
            await fx.prepare(step)
          } catch {
            return halt(step, 'failed', 'commandFailed', 'failed')
          }
          // Preparing can take seconds; check again before sending.
          if (stop.aborted) return halt(step, 'aborted', 'stopped', 'skipped')
          const again = commandGuard(fx.robot())
          if (again) return halt(step, 'aborted', again, 'skipped')
        }
        commandsSent++
        // A rejected send (e.g. a failed POST) leaves us not knowing whether the robot got it.
        const r = await fx.send(step).catch(() => 'unknown' as const)
        if (r === 'completed') {
          if (step.type === 'SET_STATE' || step.type === 'SET_GAIT') {
            liedDown = step.type === 'SET_STATE' && LIE_DOWN_STATES.has(String(step.params.state))
            if (liedDown) seenUp = false
          }
          watchPower(fx.robot())
          note(step, 'done')
          return null
        }
        // The bridge reports a motion cut short by E-Stop as a plain failure.
        if (r === 'failed' && fx.robot()?.abstract_state === 'E_STOP') return halt(step, 'aborted', 'estop', 'failed')
        if (r === 'failed') return halt(step, 'failed', 'commandFailed', 'failed')
        if (r === 'cancelled') return halt(step, 'aborted', 'commandCancelled', 'cancelled')
        return halt(step, 'failed', 'noAnswer', 'unknown')
      }
      case 'wait': {
        note(step, 'started')
        if (!(await nap(step.seconds * 1000))) return halt(step, 'aborted', 'stopped', 'skipped')
        note(step, 'done')
        return null
      }
      case 'waitUntil': {
        if (step.condition.kind === 'missing') return halt(step, 'failed', 'conditionMissing', 'failed')
        note(step, 'started')
        const t0 = fx.now()
        while (!evaluate(step.condition, fx.robot())) {
          if (fx.now() - t0 >= LIMITS.waitUntilSeconds * 1000) return halt(step, 'failed', 'waitUntilTimeout', 'failed')
          if (!(await nap(POLL_MS))) return halt(step, 'aborted', 'stopped', 'skipped')
        }
        note(step, 'done')
        return null
      }
      case 'if': {
        if (step.condition.kind === 'missing') return halt(step, 'failed', 'conditionMissing', 'failed')
        note(step, 'started')
        const h = await runList(evaluate(step.condition, fx.robot()) ? step.then : step.else)
        if (h) return h
        note(step, 'done')
        return null
      }
      case 'repeat': {
        note(step, 'started')
        for (let i = 0; i < Math.min(step.times, LIMITS.maxRepeat); i++) {
          if (!(await yieldOften())) return halt(step, 'aborted', 'stopped', 'skipped')
          if (overBudget()) return halt(step, 'failed', 'stepLimit', 'failed')
          const h = await runList(step.body)
          if (h) return h
        }
        note(step, 'done')
        return null
      }
      case 'repeatUntil': {
        if (step.condition.kind === 'missing') return halt(step, 'failed', 'conditionMissing', 'failed')
        note(step, 'started')
        let n = 0
        while (!evaluate(step.condition, fx.robot())) {
          if (n >= LIMITS.maxRepeatUntil) return halt(step, 'failed', 'repeatUntilLimit', 'failed')
          if (!(await yieldOften())) return halt(step, 'aborted', 'stopped', 'skipped')
          if (overBudget()) return halt(step, 'failed', 'stepLimit', 'failed')
          const h = await runList(step.body)
          if (h) return h
          n++
        }
        note(step, 'done')
        return null
      }
    }
  }

  try {
    const h = await runList(steps)
    if (h) return { result: h.result, reason: h.reason, commandsSent }
    return { result: 'completed', commandsSent }
  } finally {
    fx.highlight(null)
  }
}

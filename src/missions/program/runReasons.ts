import { LIMITS } from './types'

/** A step's result in a run log. */
export type StepResult = 'done' | 'failed' | 'cancelled' | 'unknown' | 'skipped'

/** One entry of a dry run's log: a step starting, or its result. */
export interface RunLogEntry {
  at: number
  blockId: string
  label: string
  result: StepResult | 'started'
  /** English text for the entry, when it has some. */
  detail?: string
}

/** Why a run stopped: the camelCase keys the edge executor sends in `reason`.
 * The UI translates these (`missions.program.run.reason.*`); the English is the source wording. */
export type RunReason =
  | 'unreachable' | 'estop' | 'fault' | 'fallen' | 'controlLost' | 'poweredDown' | 'stopped'
  | 'commandFailed' | 'commandCancelled' | 'noAnswer' | 'timeLimit' | 'bridgeRestarted'
  | 'repeatUntilLimit' | 'waitUntilTimeout' | 'commandLimit' | 'stepLimit' | 'conditionMissing' | 'lowBattery' | 'batteryUnknown'

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
  timeLimit: 'the running-time limit was reached',
  bridgeRestarted: 'the robot’s edge device restarted during the run',
  repeatUntilLimit: `repeat-until ran ${LIMITS.maxRepeatUntil} times without its condition becoming true`,
  waitUntilTimeout: `wait-until timed out after ${LIMITS.waitUntilSeconds} s`,
  commandLimit: `more than ${LIMITS.maxCommandsPerRun} commands in one run`,
  stepLimit: `more than ${LIMITS.maxStepsPerRun} steps in one run`,
  conditionMissing: 'condition missing',
  lowBattery: 'the battery fell below 15%',
  batteryUnknown: 'the battery reading disappeared',
}

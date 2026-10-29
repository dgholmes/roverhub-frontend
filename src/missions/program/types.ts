import type { CommandType } from '@/types'

/** One robot command in a compiled program. */
export interface CommandStep {
  kind: 'command'
  blockId: string
  type: CommandType
  params: Record<string, unknown>
  label: string
  quadOnly?: boolean
  /** SPEAK only: the clip is made at run time from this text. */
  speech?: { text: string; untilDone: boolean }
}

export type Condition =
  | { kind: 'batteryBelow'; pct: number }
  | { kind: 'fallen' }
  | { kind: 'standing' }
  | { kind: 'avoidanceOn' }
  /** The block's condition socket was left empty. */
  | { kind: 'missing' }

/** Mirrors shared/schemas/missions.py ConditionKind; missionTasks.test.ts checks it. */
export const CONDITION_KINDS = ['batteryBelow', 'fallen', 'standing', 'avoidanceOn', 'missing'] as const

export const STEP_KINDS = ['command', 'wait', 'repeat', 'repeatUntil', 'waitUntil', 'if'] as const

export type Step =
  | CommandStep
  | { kind: 'wait'; blockId: string; seconds: number; label: string }
  | { kind: 'repeat'; blockId: string; times: number; body: Step[]; label: string }
  | { kind: 'repeatUntil'; blockId: string; condition: Condition; body: Step[]; label: string }
  | { kind: 'waitUntil'; blockId: string; condition: Condition; label: string }
  | { kind: 'if'; blockId: string; condition: Condition; then: Step[]; else: Step[]; label: string }

/** A program compiled for each robot type, stored on the mission so the edge can run it. */
export interface ProgramSteps {
  compiler_version: number
  quad: Step[]
  wheel: Step[]
}

/** A block as the compiler reads it: Blockly's workspace flattened to plain data.
 * Statement inputs (DO, ELSE) hold the chain; value inputs (COND) one block. */
export interface ProgramBlock {
  id: string
  type: string
  fields: Record<string, string | number>
  inputs: Record<string, ProgramBlock[] | ProgramBlock | null>
}

export const LIMITS = { maxRepeat: 100, maxRepeatUntil: 100, waitUntilSeconds: 120, maxCommandsPerRun: 500, maxStepsPerRun: 5000 } as const

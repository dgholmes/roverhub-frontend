import type { CommandType } from '@/types'
import type { NavGotoParams } from '@/liveops/navGoal'

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

/** Walk to a map point and wait until the robot is there (shared NavStep,
 * 0.0.16). Compiled from a route by the BACKEND when a run starts, never by the
 * block compiler: the console only meets one in a run's record or a mock run. */
export interface NavStep {
  kind: 'navigate'
  blockId: string
  /** The waypoint's own label: authored text, shown as-is. */
  label: string
  waypointId: string
  goal: NavGotoParams
  toleranceM?: number
  maxSeconds?: number
  retries?: number
  retryWaitS?: number
  maxSpeedMps?: number | null
}

/** NavStep.maxSeconds' default (shared missions.py). */
export const NAV_STEP_DEFAULT_MAX_S = 300

/** Climb or descend one flight of stairs drawn on the map (shared StairsStep,
 * 0.0.21). The flight's landings, heading and length come from the `stairs`
 * zone `zoneId` names, on the robot's own copy of the map. The bridge checks the
 * legs (normal; `x` is switched, `unknown` refused), the battery and the entry
 * landing first -- and today refuses every flight, because the SDK has no
 * stair motion (`stairs_not_supported_by_sdk`). No block compiles to one yet. */
export interface StairsStep {
  kind: 'stairs'
  blockId: string
  label: string
  zoneId: string
  direction: 'up' | 'down'
  /** The robot's speed % for the flight, 10-100. */
  speedRatio?: number
}

/** StairsStep.speedRatio's default (shared missions.py). */
export const STAIRS_DEFAULT_SPEED_RATIO = 30

export const STEP_KINDS = ['command', 'wait', 'repeat', 'repeatUntil', 'waitUntil', 'if', 'navigate', 'stairs'] as const

export type Step =
  | CommandStep
  | { kind: 'wait'; blockId: string; seconds: number; label: string }
  | { kind: 'repeat'; blockId: string; times: number; body: Step[]; label: string }
  | { kind: 'repeatUntil'; blockId: string; condition: Condition; body: Step[]; label: string }
  | { kind: 'waitUntil'; blockId: string; condition: Condition; label: string }
  | { kind: 'if'; blockId: string; condition: Condition; then: Step[]; else: Step[]; label: string }
  | NavStep
  | StairsStep

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

import i18n from '@/i18n'
import type { RobotType, ValidationIssue, ValidationSeverity } from '@/types'
import { BLOCK_SPECS } from '@/components/missions/visual-program/blockSpecs'
import { LIMITS, type Condition, type Step } from './types'

type Range = [number, number]
const range = (block: string, field: string): Range => BLOCK_SPECS[block].numberFields![field]

function poseLimits(): Record<string, Range> {
  return {
    duration: range('rh_pose', 'DURATION'),
    roll_deg: range('rh_pose', 'ROLL'),
    pitch_deg: range('rh_pose', 'PITCH'),
    yaw_deg: range('rh_pose', 'YAW'),
    height_m: range('rh_pose', 'HEIGHT'),
  }
}

/** Limits of each compiled number, taken from the block that makes it. */
const PARAM_LIMITS: Partial<Record<string, Record<string, Range>>> = {
  LINE_WALK: { distance: range('rh_move', 'DISTANCE') },
  SET_SPEED_RATIO: { ratio: range('rh_set_speed', 'SPEED') },
  ROTATE: { angle: range('rh_rotate', 'ANGLE') },
  CIRCLE: { turns: range('rh_rotate_turns', 'TURNS') },
  DYNAMIC_POSE: poseLimits(),
  STATIC_POSE: poseLimits(),
}

type CheckCode = 'programEmpty' | 'blockNotForRobot' | 'valueOutOfRange' | 'conditionMissing' | 'programTooLong'

const tr = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string

function issue(severity: ValidationSeverity, code: CheckCode, params: Record<string, unknown> = {}, blockId?: string): ValidationIssue {
  return { severity, code, message: tr(`missions.program.check.${code}`, params), waypoint_id: null, ...(blockId ? { blockId } : {}) }
}

/** Static upper bound on commands one run sends: repeat bodies count times
 * their repeats, repeat-until the most it may loop, an if its longer branch. */
export function programStepCount(steps: Step[]): number {
  let n = 0
  for (const s of steps) {
    // A navigate leg sends one NAV_GOTO, as a command step sends one command;
    // the bridge counts a Stairs step as one too.
    if (s.kind === 'command' || s.kind === 'navigate' || s.kind === 'stairs') n += 1
    else if (s.kind === 'repeat') n += s.times * programStepCount(s.body)
    else if (s.kind === 'repeatUntil') n += LIMITS.maxRepeatUntil * programStepCount(s.body)
    else if (s.kind === 'if') n += Math.max(programStepCount(s.then), programStepCount(s.else))
  }
  return n
}

export function checkProgram(steps: Step[], robotType: RobotType | null): ValidationIssue[] {
  const out: ValidationIssue[] = []
  if (steps.length === 0) out.push(issue('error', 'programEmpty'))

  const outOfRange = (what: string, value: number, [min, max]: Range, blockId: string) => {
    if (!(value >= min && value <= max)) out.push(issue('error', 'valueOutOfRange', { what: tr(`missions.program.field.${what}`), value, min, max }, blockId))
  }
  const cond = (c: Condition, blockId: string) => {
    if (c.kind === 'missing') out.push(issue('error', 'conditionMissing', {}, blockId))
    else if (c.kind === 'batteryBelow') outOfRange('battery', c.pct, range('rh_cond_battery_below', 'PCT'), blockId)
  }

  const walk = (list: Step[]) => {
    for (const s of list) {
      switch (s.kind) {
        case 'command':
          if (s.quadOnly && robotType === 'wheel') out.push(issue('error', 'blockNotForRobot', { step: s.label }, s.blockId))
          for (const [key, r] of Object.entries(PARAM_LIMITS[s.type] ?? {})) outOfRange(key, Number(s.params[key]), r, s.blockId)
          break
        case 'wait':
          outOfRange('seconds', s.seconds, range('rh_wait', 'SECONDS'), s.blockId)
          break
        case 'repeat':
          outOfRange('times', s.times, range('rh_repeat', 'TIMES'), s.blockId)
          walk(s.body)
          break
        case 'repeatUntil':
          cond(s.condition, s.blockId)
          walk(s.body)
          break
        case 'waitUntil':
          cond(s.condition, s.blockId)
          break
        case 'if':
          cond(s.condition, s.blockId)
          walk(s.then)
          walk(s.else)
          break
        case 'navigate':
          // Compiled and checked by the backend from a route (0.0.16); the
          // block compiler never makes one, so there is nothing to check here.
          break
        case 'stairs':
          // 0.0.21. No block compiles to one yet; the backend checks its zone,
          // Stairs allowed and the robot (missions/stairs_checks.py).
          break
        default: {
          const unhandled: never = s
          void unhandled
        }
      }
    }
  }
  walk(steps)

  const count = programStepCount(steps)
  if (count > LIMITS.maxCommandsPerRun) out.push(issue('warning', 'programTooLong', { count, max: LIMITS.maxCommandsPerRun }))
  return out
}

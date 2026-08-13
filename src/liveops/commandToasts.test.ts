import { describe, expect, it } from 'vitest'
import { MAX_TRANSIENT_TOASTS, retainCommands } from './commandToasts'
import type { Command, CommandStage, CommandType } from '@/types'

function cmd(id: string, stage: CommandStage, type: CommandType = 'SET_GAIT'): Command {
  return {
    command_id: id, robot_id: 'robot-dev-01', type, label: id,
    stages: [], current_stage: stage, initiated_by: 'operator-dev',
  }
}

/** The list is newest-first, matching how the store unshifts. */
describe('retainCommands', () => {
  it('leaves a short list untouched', () => {
    const list = [cmd('a', 'requested'), cmd('b', 'execution_completed')]
    expect(retainCommands(list)).toEqual(list)
  })

  it('keeps the newest transient commands and drops the oldest', () => {
    const list = Array.from({ length: MAX_TRANSIENT_TOASTS + 3 }, (_, i) => cmd(`c${i}`, 'requested'))
    const kept = retainCommands(list)
    expect(kept).toHaveLength(MAX_TRANSIENT_TOASTS)
    expect(kept[0].command_id).toBe('c0')
    expect(kept[kept.length - 1]?.command_id).toBe(`c${MAX_TRANSIENT_TOASTS - 1}`)
  })

  // The bug this exists to prevent: a failed E-Stop scrolled off the screen by
  // five routine commands, leaving the operator believing it succeeded.
  it('never drops a failed command to make room for newer successful ones', () => {
    const failedEstop = cmd('estop', 'execution_failed', 'ESTOP')
    const newer = Array.from({ length: MAX_TRANSIENT_TOASTS + 2 }, (_, i) => cmd(`n${i}`, 'execution_completed'))
    const kept = retainCommands([...newer, failedEstop])
    expect(kept.map((c) => c.command_id)).toContain('estop')
  })

  it('retains a timed-out command as firmly as an explicitly failed one', () => {
    const timedOut = cmd('estop', 'timed_out', 'ESTOP')
    const newer = Array.from({ length: MAX_TRANSIENT_TOASTS + 2 }, (_, i) => cmd(`n${i}`, 'requested'))
    expect(retainCommands([...newer, timedOut]).map((c) => c.command_id)).toContain('estop')
  })

  it('preserves newest-first ordering among what it keeps', () => {
    const kept = retainCommands([
      cmd('newest', 'requested'),
      cmd('failed', 'execution_failed'),
      cmd('oldest', 'requested'),
    ])
    expect(kept.map((c) => c.command_id)).toEqual(['newest', 'failed', 'oldest'])
  })

  // Failures persist until dismissed, but must not be able to paper over the
  // whole viewport if something is failing in a loop.
  it('bounds how many failures accumulate', () => {
    const failures = Array.from({ length: 12 }, (_, i) => cmd(`f${i}`, 'execution_failed'))
    const kept = retainCommands(failures)
    expect(kept.length).toBeLessThan(failures.length)
    expect(kept[0].command_id).toBe('f0')
  })
})

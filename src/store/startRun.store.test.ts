import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command } from '@/types'

const stub = vi.hoisted(() => ({ acks: [] as string[] }))

vi.mock('@/lib/realtime/dataProvider', () => {
  const command = (stage: string) => ({
    command_id: 'start-1', robot_id: 'r1', type: 'START_MISSION', label: 'Start M', stages: [],
    current_stage: stage, initiated_by: 'operator-dev',
    failure_reason: stage === 'execution_failed' ? 'REJECTED_ESTOP: the robot is in E-Stop' : undefined,
  })
  const run = { run_id: 'run-1', robot_id: 'r1' }
  return {
    USE_REAL_BACKEND: true,
    dataProvider: {
      getRobots: () => [],
      startRun: async (_robotId: string, _req: unknown, onCommand?: (c: unknown) => void) => {
        for (const s of stub.acks) onCommand?.(command(s))
        return { run }
      },
      runTaskNow: async (_taskId: string, _steps: unknown, onCommand?: (c: unknown) => void) => {
        for (const s of stub.acks) onCommand?.(command(s))
        return { occurrence: { occurrence_id: 'run-1' }, run }
      },
    },
  }
})

import { useLiveOpsStore } from './useLiveOpsStore'

describe('starting a run through the store', () => {
  beforeEach(() => {
    useLiveOpsStore.setState({ activeCommands: [], startingRuns: {} })
    stub.acks = []
  })

  it('test_run_now_start_command_reaches_the_toasts_and_marks_the_robot_starting', async () => {
    stub.acks = ['requested']
    const seen: Command[] = []
    await useLiveOpsStore.getState().runTaskNow('task-1', [], (c) => seen.push(c))
    expect(useLiveOpsStore.getState().activeCommands.map((c) => c.command_id)).toEqual(['start-1'])
    expect(seen.map((c) => c.current_stage)).toEqual(['requested'])
    expect(useLiveOpsStore.getState().startingRuns.r1?.runId).toBe('run-1')
  })

  it('test_a_refused_start_is_no_longer_starting_and_its_failure_is_a_toast', async () => {
    stub.acks = ['requested', 'execution_failed']
    await useLiveOpsStore.getState().startRun('r1', {} as never)
    expect(useLiveOpsStore.getState().activeCommands[0].current_stage).toBe('execution_failed')
    expect(useLiveOpsStore.getState().startingRuns.r1).toBeUndefined()
  })
})

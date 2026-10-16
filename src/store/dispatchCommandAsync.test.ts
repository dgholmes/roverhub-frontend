import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command } from '@/types'

const stub = vi.hoisted(() => ({ stages: [] as string[], id: 'c1' }))

vi.mock('@/lib/realtime/dataProvider', () => ({
  USE_REAL_BACKEND: false,
  dataProvider: {
    getRobots: () => [],
    dispatchCommand: (
      robotId: string, type: string, label: string,
      onUpdate: (c: unknown) => void, params?: unknown,
    ) => {
      for (const stage of stub.stages) {
        onUpdate({
          command_id: stub.id, robot_id: robotId, type, label, params,
          stages: [], current_stage: stage, initiated_by: 'test',
        })
      }
    },
  },
}))

import { LOCAL_FAILURE_PREFIX, LOCAL_REJECTED_PREFIX } from '@/lib/realtime/realDataProvider'
import { useLiveOpsStore } from './useLiveOpsStore'

async function run(stages: string[], id = 'c1') {
  stub.stages = stages
  stub.id = id
  const calls: Command[] = []
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync('r1', 'LED_SIGNAL', 'Light')
  calls.push(outcome.command)
  return outcome
}

describe('dispatchCommandAsync', () => {
  beforeEach(() => useLiveOpsStore.setState({ activeCommands: [] }))

  it.each([
    ['execution_completed', 'completed'],
    ['execution_failed', 'failed'],
    ['cancelled', 'cancelled'],
    ['timed_out', 'unknown'],
  ])('resolves %s as %s', async (stage, result) => {
    const outcome = await run(['requested', 'sent_to_edge', stage])
    expect(outcome.result).toBe(result)
    expect(outcome.command.current_stage).toBe(stage)
  })

  it('resolves on the first terminal stage only, and records into activeCommands', async () => {
    const outcome = await run(['requested', 'execution_completed', 'execution_failed'])
    expect(outcome.result).toBe('completed')
    const active = useLiveOpsStore.getState().activeCommands
    expect(active).toHaveLength(1)
    expect(active[0]?.current_stage).toBe('execution_failed')
  })

  it('resolves a command that certainly never reached the robot as failed', async () => {
    const outcome = await run(['requested', 'execution_failed'], `${LOCAL_REJECTED_PREFIX}1`)
    expect(outcome.result).toBe('failed')
  })

  it('resolves a POST that timed out as unknown, since it may have reached the robot', async () => {
    const outcome = await run(['requested', 'execution_failed'], `${LOCAL_FAILURE_PREFIX}1`)
    expect(outcome.result).toBe('unknown')
    expect(outcome.command.current_stage).toBe('execution_failed')
  })
})

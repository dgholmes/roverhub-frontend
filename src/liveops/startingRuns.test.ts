import { describe, expect, it } from 'vitest'
import type { RobotState } from '@/types'
import { initialRobots } from '@/mocks/mockRobots'
import { reconcileStartingRuns, START_HINT_MAX_MS } from './startingRuns'

const robot = (over: Partial<RobotState>): RobotState => ({ ...initialRobots[1], ...over })

describe('reconcileStartingRuns', () => {
  const starting = { r1: { runId: 'run-1', at: 1_000 } }

  it('keeps a start while its run has not appeared on the robot', () => {
    expect(reconcileStartingRuns(starting, [robot({ robot_id: 'r1', active_run: null })], 2_000)).toBe(starting)
  })

  it('drops it once the robot shows the run', () => {
    const on = robot({ robot_id: 'r1', active_run: { run_id: 'run-1', status: 'running', step_label: null, block_id: null, started_at: '', redo_step_label: null } })
    expect(reconcileStartingRuns(starting, [on], 2_000)).toEqual({})
  })

  it('drops it after the backend would have failed it for no answer', () => {
    expect(reconcileStartingRuns(starting, [robot({ robot_id: 'r1', active_run: null })], 1_000 + START_HINT_MAX_MS)).toEqual({})
  })
})

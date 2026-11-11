// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotRunView } from '@/liveops/robotRun'
import type { RobotState } from '@/types'
import { CurrentTaskBar } from './CurrentTaskBar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...initialRobots[1], abstract_state: 'STAND', control_owner: null, ...over })
const blocked = (over: Partial<NonNullable<RobotRunView>> = {}): NonNullable<RobotRunView> => ({
  phase: 'paused', runId: 'run-42', missionName: 'Perimeter', stepLabel: null, blockId: null, redoStepLabel: 'Gate B',
  startedAt: '2026-11-11T00:00:00Z', owner: null, youHoldControl: false, estimateS: null,
  pausedFor: 'blocked', pauseReason: 'nav2_aborted', waypointId: null, ...over,
})

let host: HTMLDivElement
let root: Root
let dispatch: ReturnType<typeof vi.fn>
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  dispatch = vi.fn()
  useLiveOpsStore.setState({ dispatchCommand: dispatch as never })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('Retry in the task bar', () => {
  it('sends RESUME with the run id', () => {
    const r = robot()
    act(() => root.render(<CurrentTaskBar robot={r} run={blocked()} />))
    const retry = button(i18n.t('command.taskBar.run.retry'))
    expect(retry).toBeDefined()
    act(() => retry!.click())
    expect(dispatch).toHaveBeenCalledWith(r.robot_id, 'RESUME', i18n.t('command.taskBar.run.retryCommand'), { run_id: 'run-42' })
  })

  it('is absent when someone holds control', () => {
    act(() => root.render(<CurrentTaskBar robot={robot({ abstract_state: 'MANUAL', control_owner: 'operator-b' })} run={blocked({ owner: 'operator-b' })} />))
    expect(button(i18n.t('command.taskBar.run.retry'))).toBeUndefined()
  })

  it('is absent for an operator pause, and RESUME is offered nowhere else on the bar', () => {
    act(() => root.render(<CurrentTaskBar robot={robot()} run={blocked({ pausedFor: 'operator' })} />))
    expect(button(i18n.t('command.taskBar.run.retry'))).toBeUndefined()
    expect(button(i18n.t('command.taskBar.buttons.RESUME'))).toBeUndefined()
    expect(host.textContent).not.toContain(i18n.t('command.taskBar.buttons.RESUME'))
  })
})

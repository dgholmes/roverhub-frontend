// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { ESTOP_HOLD_MS } from '@/liveops/estopHold'
import type { Mission, RobotState } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// taskBarModel failing stands in for any bad run value: it feeds the slot, the
// control toggle and the run buttons alike.
const { model } = vi.hoisted(() => ({ model: { failing: false } }))
vi.mock('@/liveops/taskBar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/liveops/taskBar')>()
  return {
    ...actual,
    taskBarModel: (...args: Parameters<typeof actual.taskBarModel>) => {
      if (model.failing) throw new Error('bad run value')
      return actual.taskBarModel(...args)
    },
  }
})

import { CurrentTaskBar } from './CurrentTaskBar'

const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...initialRobots[1], abstract_state: 'STAND', control_owner: null, ...over })

let host: HTMLDivElement
let root: Root
let dispatch: ReturnType<typeof vi.fn>
let errorLog: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  dispatch = vi.fn()
  useLiveOpsStore.setState({ dispatchCommand: dispatch as never })
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  errorLog.mockRestore()
  model.failing = false
  vi.useRealTimers()
})

const byAria = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const alerts = () => host.querySelectorAll('[role="alert"]')

/** Hold the E-Stop (keyboard parity with the pointer hold) until it fires. */
function holdEstop() {
  const estop = byAria(i18n.t('command.estop.holdAria'))
  expect(estop).not.toBeNull()
  act(() => { estop!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  act(() => { vi.advanceTimersByTime(ESTOP_HOLD_MS + 50) })
}

describe('CurrentTaskBar with a part that throws', () => {
  it('draws no fallback when nothing throws', () => {
    act(() => root.render(<CurrentTaskBar robot={robot()} />))
    expect(alerts()).toHaveLength(0)
    expect(byAria(i18n.t('command.estop.holdAria'))).not.toBeNull()
    expect(byAria(i18n.t('command.control.takeAria'))).not.toBeNull()
  })

  it('keeps the E-Stop, and it still fires, when the mission slot throws', () => {
    vi.useFakeTimers()
    // A mission with no waypoint list: the slot reads mission.waypoints[...] and throws.
    const broken = { id: 'm1', name: 'Broken', type: 'patrol', current_waypoint_index: 0 } as unknown as Mission
    const r = robot()
    act(() => root.render(<CurrentTaskBar robot={r} mission={broken} />))
    expect(alerts()).toHaveLength(1)
    expect(host.textContent).toContain(i18n.t('common.errorBoundary.pane'))
    // Everything beside the slot is still there.
    expect(byAria(i18n.t('command.control.takeAria'))).not.toBeNull()
    holdEstop()
    expect(dispatch).toHaveBeenCalledWith(r.robot_id, 'ESTOP', i18n.t('command.estop.engageCommand'))
  })

  it('keeps the E-Stop and a working Take control when taskBarModel throws', () => {
    vi.useFakeTimers()
    model.failing = true
    const r = robot()
    act(() => root.render(<CurrentTaskBar robot={r} />))
    // The slot, the control toggle and the run buttons each show their own fallback.
    expect(alerts().length).toBeGreaterThanOrEqual(2)
    expect(host.textContent).toContain('bad run value')
    // The plain toggle stands in for the model's one, and works.
    const take = byAria(i18n.t('command.control.takeAria'))
    expect(take).not.toBeNull()
    act(() => take!.click())
    expect(dispatch).toHaveBeenCalledWith(r.robot_id, 'TAKE_CONTROL', i18n.t('command.control.takeCommand'), expect.anything())
    holdEstop()
    expect(dispatch).toHaveBeenCalledWith(r.robot_id, 'ESTOP', i18n.t('command.estop.engageCommand'))
  })

  it('stands in with Release for a robot under manual control', () => {
    model.failing = true
    act(() => root.render(<CurrentTaskBar robot={robot({ abstract_state: 'MANUAL', control_owner: 'operator-dev' })} />))
    expect(byAria(i18n.t('command.control.releaseAria'))).not.toBeNull()
  })
})

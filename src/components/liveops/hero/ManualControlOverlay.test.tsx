// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { currentOperatorId } from '@/lib/realtime/operator'
import { DRIVE_INPUT_POLL_MS } from '@/lib/teleop'
import { useDriveSpeedStore } from '@/store/useDriveSpeedStore'
import type { RobotState } from '@/types'

// The overlay reads three actions from the live-ops store. One object for the
// whole file, so their identities stay put across renders as the real store's do.
const live = vi.hoisted(() => {
  const drives: number[][] = []
  const actions = {
    driveRobot: (_robotId: string, vx: number, vy: number, vyaw: number, ratio?: number) => {
      drives.push([vx, vy, vyaw, ratio ?? NaN])
      return true
    },
    lookRobot: () => true,
    dispatchCommand: () => {},
  }
  return { drives, actions }
})
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (select: (s: typeof live.actions) => unknown) => select(live.actions),
}))

import { ManualControlOverlay } from './ManualControlOverlay'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const robot: RobotState = {
  ...initialRobots[1], robot_id: 'rover-pi', control_owner: currentOperatorId(),
}

let container: HTMLDivElement
let root: Root

const key = (type: 'keydown' | 'keyup', k: string) =>
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: k })) })
const poll = (ms = DRIVE_INPUT_POLL_MS) => act(() => { vi.advanceTimersByTime(ms) })
const lastDrive = () => live.drives[live.drives.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  live.drives.length = 0
  useDriveSpeedStore.setState({ speeds: {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('ManualControlOverlay speed', () => {
  it('shows the command bar\'s speed read-only, with no picker of its own', () => {
    useDriveSpeedStore.getState().setTier('rover-pi', 'slow')
    act(() => root.render(<ManualControlOverlay robot={robot} />))
    expect(container.textContent).toContain('Speed 30%')
    // Gait is the only segmented picker left on the pad.
    expect(container.querySelectorAll('[role="tablist"][aria-label="Speed"]')).toHaveLength(0)
    expect(container.textContent).not.toContain('live')
  })

  it('sends full-stick velocities carrying the chosen speed %', () => {
    useDriveSpeedStore.getState().setCustomPct('rover-pi', 35)
    act(() => root.render(<ManualControlOverlay robot={robot} />))

    key('keydown', 'w')
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 35])

    key('keydown', 'd')
    poll()
    expect(lastDrive()).toEqual([0.64, -0.32, 0, 35])

    key('keydown', 'q')
    poll()
    expect(lastDrive()).toEqual([0.64, -0.32, 1.04, 35])
  })

  it('sends a new speed % at once while a key is held, not at the next keepalive', () => {
    act(() => root.render(<ManualControlOverlay robot={robot} />))
    key('keydown', 'w')
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 60])
    const sent = live.drives.length

    act(() => useDriveSpeedStore.getState().setTier('rover-pi', 'fast'))
    poll()
    expect(live.drives.length).toBe(sent + 1)
    expect(lastDrive()).toEqual([0.64, 0, 0, 80])
  })

  it('stops with the chosen speed % too', () => {
    useDriveSpeedStore.getState().setTier('rover-pi', 'slow')
    act(() => root.render(<ManualControlOverlay robot={robot} />))
    key('keydown', 'w')
    poll()
    key('keyup', 'w')
    poll(1000) // past the short-tap hold
    expect(lastDrive()).toEqual([0, 0, 0, 30])
  })
})

describe('ManualControlOverlay sideways sweep', () => {
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
  const click = (name: string) => act(() => { button(name)!.click() })
  /** Mount, and let the pad's own first stop go out before the sweep. */
  const mount = (r: RobotState = robot) => {
    act(() => root.render(<ManualControlOverlay robot={r} />))
    poll()
    live.drives.length = 0
  }

  it('offers the sweep only while this operator holds control of a quad', () => {
    mount()
    expect(button('Measure sideways')).toBeDefined()
    act(() => root.render(<ManualControlOverlay robot={{ ...robot, control_owner: 'someone-else' }} />))
    expect(button('Measure sideways')).toBeUndefined()
    act(() => root.render(<ManualControlOverlay robot={{ ...robot, robot_type: 'wheel' }} />))
    expect(button('Measure sideways')).toBeUndefined()
  })

  it('asks in place first, and Cancel sends nothing', () => {
    mount()
    click('Measure sideways')
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain(
      'The robot will step left and right for about 30 s at 80% speed. Keep 1 m clear on both sides and the E-Stop in reach.',
    )
    click('Cancel')
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(button('Measure sideways')).toBeDefined()
    poll(2000)
    expect(live.drives).toEqual([])
  })

  it('shows the running step and stops at once on Stop', () => {
    mount()
    click('Measure sideways')
    click('Start')
    expect(lastDrive()).toEqual([0, 0.025, 0, 80])
    expect(container.textContent).toContain('Left, stick 0.5 — 2.0 s')
    poll(600)
    expect(container.textContent).toContain('Left, stick 0.5 — 1.4 s')
    // The pad's own drive loop stands down: nothing at the operator's 60 %.
    expect(live.drives.every((d) => d[3] === 80)).toBe(true)

    click('Stop')
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    expect(container.textContent).toContain('Stopped — stopped by you')
    const sent = live.drives.length
    poll(5000)
    expect(live.drives.length).toBe(sent)
  })

  it('a drive key stops the sweep and drives nothing', () => {
    mount()
    click('Measure sideways')
    click('Start')
    poll(500)
    key('keydown', 'w')
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    poll(1000)
    expect(live.drives.some((d) => d[0] !== 0)).toBe(false)
    expect(container.textContent).toContain('Stopped')
    key('keyup', 'w')
  })

  it('shows the start and end clock times when done', () => {
    vi.setSystemTime(new Date(2026, 10, 24, 14, 0, 0))
    mount()
    vi.setSystemTime(new Date(2026, 10, 24, 14, 0, 0))
    click('Measure sideways')
    click('Start')
    poll(28_000)
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    expect(container.textContent).toContain('Done — tell Claude the time')
    expect(container.textContent).toContain('Started 14:00:00 · ended 14:00:28')
    click('OK')
    expect(button('Measure sideways')).toBeDefined()
  })
})

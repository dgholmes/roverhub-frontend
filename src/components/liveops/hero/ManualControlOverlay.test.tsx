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

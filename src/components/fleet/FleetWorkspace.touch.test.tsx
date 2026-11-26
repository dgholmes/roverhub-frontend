// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'

/**
 * Fleet's first screen, by viewport width (the 2026-11-26 rule).
 *
 * Wide (700 px and up) is the desktop layout whatever the pointer: roster and
 * inspector side by side, the session's robot in the inspector, the
 * Robots/Docks tabs above. A 1420 px tablet got the phone layout before this,
 * and the operator had to tap a robot before seeing anything.
 *
 * Narrow is one pane at a time: the roster, a tap opening the inspector, Back
 * returning. This file mounts for real, which `FleetRobotsView.touch.test.tsx`
 * cannot: the narrow bug it pins was that `FleetWorkspace` seeded its
 * selection from the session store, and the shell makes that almost never
 * null -- `reconcileSelectedRobot` puts the session on `robotIds[0]` whenever
 * the selection is invalid and the site has robots, and SiteShell calls it on
 * every site entry. Here the store is seeded the way the shell really leaves
 * it, and the tap that opens the inspector is a real click.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const shell = vi.hoisted(() => ({ touch: true, narrow: true }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, narrow: shell.narrow, orientation: 'portrait' as const, big: false }),
}))

vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => initialRobots }))

// The inspector is a whole workspace of its own, with its own tests; what
// matters here is whether it is on screen, and for which robot.
vi.mock('./v2/RobotInspector', () => ({
  RobotInspector: ({ robot }: { robot: { robot_id: string } }) => <i data-robot-inspector={robot.robot_id} />,
}))

// The real store would start the data provider on mount.
vi.mock('@/store/useLiveOpsStore', () => {
  const state = { init: () => {}, teardown: () => {}, missions: {} } as Record<string, unknown>
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(state)
  useLiveOpsStore.getState = () => state
  return { useLiveOpsStore }
})

import { FleetWorkspace } from './FleetWorkspace'
import { useSessionStore } from '@/store/useSessionStore'

/** The selection the shell really leaves behind: a robot, never null. */
const SEEDED = initialRobots[1].robot_id
/** A different one, so a test cannot pass on the seeded robot by accident. */
const ASKED_FOR = initialRobots[2].robot_id

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<FleetWorkspace />))
}

const roster = () => host.querySelector('[data-fleet-roster]')
const inspector = () => host.querySelector('[data-robot-inspector]')
const inspected = () => inspector()?.getAttribute('data-robot-inspector')
const backButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('touch.back.fleet')))
const rows = () => [...host.querySelectorAll('[data-fleet-roster] [role="listitem"]')] as HTMLButtonElement[]

beforeEach(() => {
  shell.touch = true
  shell.narrow = true
  useSessionStore.setState({ selectedRobotId: SEEDED, selectionPending: false, requestedRobotId: null })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Fleet on a wide screen, touch or not', () => {
  for (const touch of [true, false]) {
    const pointer = touch ? 'a finger' : 'a mouse'

    it(`opens with ${pointer} on the desktop layout: roster, the session's robot, the tabs`, () => {
      shell.touch = touch
      shell.narrow = false
      mount()
      expect(roster()).not.toBeNull()
      expect(inspected()).toBe(SEEDED)
      expect(host.textContent).toContain(i18n.t('fleet.tabs.docks'))
      // Both panes are on screen, so there is nothing to go back to.
      expect(backButton()).toBeUndefined()
    })

    it(`with ${pointer}, picking a robot shows it beside the roster`, () => {
      shell.touch = touch
      shell.narrow = false
      mount()
      const other = rows().find((r) => r.getAttribute('aria-current') !== 'true')!
      act(() => { other.click() })
      expect(roster()).not.toBeNull()
      expect(inspector()).not.toBeNull()
      expect(inspected()).not.toBe(SEEDED)
      expect(other.getAttribute('aria-current')).toBe('true')
      expect(host.textContent).toContain(i18n.t('fleet.tabs.docks'))
    })
  }
})

describe('Fleet on a narrow screen, one pane at a time', () => {
  for (const touch of [true, false]) {
    const who = touch ? 'a phone' : 'a narrow desktop window'

    it(`opens ${who} on the roster even though the shell has already picked a robot`, () => {
      shell.touch = touch
      mount()
      expect(useSessionStore.getState().selectedRobotId).toBe(SEEDED)
      expect(roster()).not.toBeNull()
      expect(inspector()).toBeNull()
      // The roster's own tabs come with it.
      expect(host.textContent).toContain(i18n.t('fleet.tabs.docks'))
    })
  }

  it('opens the inspector when a robot is tapped, and Back returns to the roster and its tabs', () => {
    mount()
    const row = rows()[0]
    expect(row).toBeDefined()
    act(() => { row.click() })
    expect(inspector()).not.toBeNull()
    expect(roster()).toBeNull()
    expect(host.textContent).not.toContain(i18n.t('fleet.tabs.docks'))
    // Back is the way out of the inspector, and it brings everything back.
    act(() => { backButton()!.click() })
    expect(roster()).not.toBeNull()
    expect(inspector()).toBeNull()
    expect(host.textContent).toContain(i18n.t('fleet.tabs.docks'))
  })

  // The other half of the same decision. A RobotLink -- in Schedule's cards,
  // or the org console's openRobot -- means "open this robot", and it works
  // by setting the session selection and navigating to Fleet. With the seed
  // ignoring that selection, the link landed on the roster while having
  // silently changed which robot LiveOps shows: worse than a no-op. So those
  // links request the robot by name, and the roster still wins on an
  // ordinary entry (the test above).
  it('opens the robot a link asked for', () => {
    useSessionStore.getState().requestRobot(ASKED_FOR)
    mount()
    expect(inspected()).toBe(ASKED_FOR)
    expect(roster()).toBeNull()
    expect(backButton()).toBeDefined()
  })

  it('spends the request, so the next visit is the roster again', () => {
    useSessionStore.getState().requestRobot(ASKED_FOR)
    mount()
    expect(inspector()).not.toBeNull()
    expect(useSessionStore.getState().requestedRobotId).toBeNull()
    act(() => root.unmount())
    host.remove()
    mount()
    expect(roster()).not.toBeNull()
    expect(inspector()).toBeNull()
  })
})

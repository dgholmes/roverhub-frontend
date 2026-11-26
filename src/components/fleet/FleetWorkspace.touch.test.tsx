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
 * inspector side by side, the session's robot in the inspector. A 1420 px
 * tablet got the phone layout before this,
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
  act(() => root.render(<FleetWorkspace siteId="site-dev" />))
}

const roster = () => host.querySelector('[data-fleet-roster]')
const inspector = () => host.querySelector('[data-robot-inspector]')
const inspected = () => inspector()?.getAttribute('data-robot-inspector')
const backButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('touch.back.fleet')))
const rows = () => [...host.querySelectorAll('[data-fleet-roster] [role="listitem"]')] as HTMLButtonElement[]

beforeEach(() => {
  shell.touch = true
  shell.narrow = true
  useSessionStore.setState({ selectedRobotId: SEEDED, selectionPending: false })
  // A bare Fleet address, as the rail leaves it; a click in one test writes
  // the address and must not carry into the next.
  window.history.replaceState(null, '', '#/site/site-dev/fleet')
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Fleet on a wide screen, touch or not', () => {
  for (const touch of [true, false]) {
    const pointer = touch ? 'a finger' : 'a mouse'

    it(`opens with ${pointer} on the desktop layout: roster and the session's robot`, () => {
      shell.touch = touch
      shell.narrow = false
      mount()
      expect(roster()).not.toBeNull()
      expect(inspected()).toBe(SEEDED)
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
    })
  }

  it('opens the inspector when a robot is tapped, and Back returns to the roster', () => {
    mount()
    const row = rows()[0]
    expect(row).toBeDefined()
    act(() => { row.click() })
    expect(inspector()).not.toBeNull()
    expect(roster()).toBeNull()
    // Back is the way out of the inspector, and it brings the roster back.
    act(() => { backButton()!.click() })
    expect(roster()).not.toBeNull()
    expect(inspector()).toBeNull()
  })

  it('Back returns to the roster address', () => {
    window.history.replaceState(null, '', '#/site/site-dev/fleet/' + ASKED_FOR)
    mount()
    expect(inspected()).toBe(ASKED_FOR)
    act(() => { backButton()!.click() })
    expect(window.location.hash).toBe('#/site/site-dev/fleet')
    expect(roster()).not.toBeNull()
    expect(inspector()).toBeNull()
  })

  // The other half of the same decision. A link that means "open this
  // robot" -- RobotLink in Schedule's cards, the org console's openRobot --
  // names it in the address, and the roster still wins on an ordinary entry
  // (the test above). It used to ask through the session store instead, which
  // the address made unnecessary.
  it('opens the robot a link names', () => {
    window.history.replaceState(null, '', '#/site/site-dev/fleet/' + ASKED_FOR)
    mount()
    expect(inspected()).toBe(ASKED_FOR)
    expect(roster()).toBeNull()
    expect(backButton()).toBeDefined()
    // Opening it in Fleet does not change which robot LiveOps shows.
    expect(useSessionStore.getState().selectedRobotId).toBe(SEEDED)
  })
})

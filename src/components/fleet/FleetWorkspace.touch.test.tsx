// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'

/**
 * Fleet's first screen on a handheld (design decision D3): the roster, with a
 * tap opening the inspector.
 *
 * This file mounts for real, which `FleetRobotsView.touch.test.tsx` cannot:
 * the bug it pins was that `FleetWorkspace` seeded its selection from the
 * session store, and the shell makes that almost never null --
 * `reconcileSelectedRobot` puts the session on `robotIds[0]` whenever the
 * selection is invalid and the site has robots, and SiteShell calls it on
 * every site entry. The sibling file renders `FleetRobotsView` with
 * `selectedRobotId: null`, a state the shell never produces, so it could not
 * see it. Here the store is seeded the way the shell really leaves it, and
 * the tap that opens the inspector is a real click.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const shell = vi.hoisted(() => ({ touch: true }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait' as const, big: false }),
}))

vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => initialRobots }))

// The inspector is a whole workspace of its own, with its own tests; what
// matters here is only whether it is on screen instead of the roster.
vi.mock('./v2/RobotInspector', () => ({ RobotInspector: () => <i data-robot-inspector="" /> }))

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

beforeEach(() => {
  shell.touch = true
  useSessionStore.setState({ selectedRobotId: SEEDED, selectionPending: false, requestedRobotId: null })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Fleet on a handheld', () => {
  it('opens on the roster even though the shell has already picked a robot', () => {
    mount()
    expect(useSessionStore.getState().selectedRobotId).toBe(SEEDED)
    expect(host.querySelector('[data-fleet-roster]')).not.toBeNull()
    expect(host.querySelector('[data-robot-inspector]')).toBeNull()
    // The roster's own tabs come with it.
    expect(host.textContent).toContain(i18n.t('fleet.tabs.docks'))
  })

  it('opens the inspector when a robot is tapped, and takes the roster with it', () => {
    mount()
    const row = host.querySelector('[data-fleet-roster] [role="listitem"]') as HTMLButtonElement
    expect(row).not.toBeNull()
    act(() => { row.click() })
    expect(host.querySelector('[data-robot-inspector]')).not.toBeNull()
    expect(host.querySelector('[data-fleet-roster]')).toBeNull()
    expect(host.textContent).not.toContain(i18n.t('fleet.tabs.docks'))
    // Back returns to the roster, which is the only way out of the inspector.
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('touch.back.fleet')))!
    act(() => { back.click() })
    expect(host.querySelector('[data-fleet-roster]')).not.toBeNull()
  })

  // The other half of the same decision. A RobotLink -- in Schedule's cards,
  // or the org console's openRobot -- means "open this robot", and it works
  // by setting the session selection and navigating to Fleet. With the seed
  // ignoring that selection, the link landed on the roster while having
  // silently changed which robot LiveOps shows: worse than a no-op. So those
  // links request the robot by name, and the roster still wins on an
  // ordinary entry (the test above).
  it('opens the robot a link asked for, even on touch', () => {
    useSessionStore.getState().requestRobot(ASKED_FOR)
    mount()
    expect(host.querySelector('[data-robot-inspector]')).not.toBeNull()
    expect(host.querySelector('[data-fleet-roster]')).toBeNull()
  })

  it('spends the request, so the next visit is the roster again', () => {
    useSessionStore.getState().requestRobot(ASKED_FOR)
    mount()
    expect(host.querySelector('[data-robot-inspector]')).not.toBeNull()
    expect(useSessionStore.getState().requestedRobotId).toBeNull()
    act(() => root.unmount())
    host.remove()
    mount()
    expect(host.querySelector('[data-fleet-roster]')).not.toBeNull()
    expect(host.querySelector('[data-robot-inspector]')).toBeNull()
  })

  it('still opens on the session selection on a fine pointer', () => {
    shell.touch = false
    mount()
    expect(host.querySelector('[data-robot-inspector]')).not.toBeNull()
    expect(host.querySelector('[data-fleet-roster]')).not.toBeNull()
  })
})

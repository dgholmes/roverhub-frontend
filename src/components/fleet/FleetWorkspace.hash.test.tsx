// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { InspectorTab } from '@/app/routes'

/**
 * Fleet keeps what it shows in the address (2026-11-26): the robot inspected,
 * the inspector's tab, and Robots or Docks. The operator had rover-jetson open
 * in Fleet; a reload showed the session's rover-pi, because the inspected
 * robot lived only in component state and was re-seeded from LiveOps'
 * selection. The seed itself is unchanged and is pinned by
 * `FleetWorkspace.touch.test.tsx`; this file pins the address on top of it.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const shell = vi.hoisted(() => ({ touch: false, narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, narrow: shell.narrow, orientation: 'landscape' as const, big: false }),
}))

vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => initialRobots }))

// The inspector stood in: which robot, which tab, and a way to change the tab.
vi.mock('./v2/RobotInspector', () => ({
  RobotInspector: ({ robot, tab, onTabChange }: { robot: { robot_id: string }; tab?: InspectorTab; onTabChange?: (t: InspectorTab) => void }) => (
    <i data-robot-inspector={robot.robot_id} data-tab={tab ?? ''}>
      <button data-to-tab="edge" onClick={() => onTabChange?.('edge')} />
    </i>
  ),
}))

vi.mock('@/store/useLiveOpsStore', () => {
  const state = { init: () => {}, teardown: () => {}, missions: {} } as Record<string, unknown>
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(state)
  useLiveOpsStore.getState = () => state
  return { useLiveOpsStore }
})

import { FleetWorkspace } from './FleetWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { hashForFleet } from '@/app/routes'

const SITE = 'site a'
/** LiveOps' robot, which a reload used to show. */
const SESSION = initialRobots[1].robot_id
/** The robot the operator was inspecting. */
const INSPECTED = initialRobots[2].robot_id

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

function mount(hash: string) {
  window.history.replaceState(null, '', hash)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<FleetWorkspace />))
}

const inspector = () => host.querySelector<HTMLElement>('[data-robot-inspector]')
const inspected = () => inspector()?.getAttribute('data-robot-inspector')
const roster = () => host.querySelector('[data-fleet-roster]')
const row = (id: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-fleet-roster] [role="listitem"]')]
  .find((b) => b.textContent?.includes(initialRobots.find((r) => r.robot_id === id)!.name))!
const tabButton = (key: 'robots' | 'docks') => [...host.querySelectorAll('button')].find((b) => b.textContent === i18n.t(`fleet.tabs.${key}`))!
const backButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('touch.back.fleet')))

beforeEach(() => {
  shell.touch = false
  shell.narrow = false
  useSessionStore.setState({ activeSiteId: SITE, selectedRobotId: SESSION, selectionPending: false, requestedRobotId: null })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  window.history.replaceState(null, '', '#/')
})

describe('a reload of Fleet', () => {
  it('reopens the robot the address names, not the session robot', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    expect(inspected()).toBe(INSPECTED)
    // Browsing Fleet never moves LiveOps' robot.
    expect(useSessionStore.getState().selectedRobotId).toBe(SESSION)
  })

  it('reopens the inspector tab the address names', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED, inspectorTab: 'motors' }))
    expect(inspector()?.dataset.tab).toBe('motors')
  })

  it('starts the inspector on Overview when the address names no tab', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    expect(inspector()?.dataset.tab).toBe('overview')
  })

  it('reopens Docks', () => {
    mount(hashForFleet(SITE, { tab: 'docks' }))
    expect(roster()).toBeNull()
    expect(inspector()).toBeNull()
  })

  it('seeds from the session as before when the address names no robot', () => {
    mount(hashForFleet(SITE))
    expect(inspected()).toBe(SESSION)
  })

  it('falls back to that seed for a robot this site no longer has', () => {
    mount(hashForFleet(SITE, { robotId: 'robot-that-left', inspectorTab: 'service' }))
    expect(inspected()).toBe(SESSION)
  })

  it('on a narrow screen opens the inspector on the robot the address names', () => {
    shell.narrow = true
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    expect(inspected()).toBe(INSPECTED)
    expect(roster()).toBeNull()
  })

  it('on a narrow screen shows the roster for a robot this site no longer has', () => {
    shell.narrow = true
    mount(hashForFleet(SITE, { robotId: 'robot-that-left' }))
    expect(roster()).not.toBeNull()
    expect(inspector()).toBeNull()
  })
})

describe('what Fleet writes to the address', () => {
  it('names a picked robot, in place, so Back still leaves Fleet', () => {
    mount(hashForFleet(SITE))
    const before = window.history.length
    act(() => { row(INSPECTED).click() })
    expect(window.location.hash).toBe(hashForFleet(SITE, { robotId: INSPECTED }))
    expect(window.history.length).toBe(before)
    expect(useSessionStore.getState().selectedRobotId).toBe(SESSION)
  })

  it('names the inspector tab, and keeps it when another robot is picked', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    act(() => { host.querySelector<HTMLButtonElement>('[data-to-tab="edge"]')!.click() })
    expect(inspector()?.dataset.tab).toBe('edge')
    expect(window.location.hash).toBe(hashForFleet(SITE, { robotId: INSPECTED, inspectorTab: 'edge' }))
    act(() => { row(SESSION).click() })
    expect(window.location.hash).toBe(hashForFleet(SITE, { robotId: SESSION, inspectorTab: 'edge' }))
  })

  it('names Docks, and Robots brings the inspected robot back', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    act(() => { tabButton('docks').click() })
    expect(window.location.hash).toBe(hashForFleet(SITE, { tab: 'docks' }))
    act(() => { tabButton('robots').click() })
    expect(window.location.hash).toBe(hashForFleet(SITE, { robotId: INSPECTED }))
    expect(inspected()).toBe(INSPECTED)
  })

  it("on a narrow screen, the inspector's Back puts the roster's address back", () => {
    shell.narrow = true
    mount(hashForFleet(SITE, { robotId: INSPECTED, inspectorTab: 'motors' }))
    act(() => { backButton()!.click() })
    expect(roster()).not.toBeNull()
    expect(window.location.hash).toBe(hashForFleet(SITE))
  })
})

describe('Back and Forward while Fleet stays open', () => {
  it('follows the address to another robot, tab or page', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    act(() => {
      window.history.replaceState(null, '', hashForFleet(SITE, { robotId: SESSION, inspectorTab: 'tests' }))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(inspected()).toBe(SESSION)
    expect(inspector()?.dataset.tab).toBe('tests')
    act(() => {
      window.history.replaceState(null, '', hashForFleet(SITE, { tab: 'docks' }))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(inspector()).toBeNull()
  })

  it('ignores an address that is not Fleet (the shell is leaving)', () => {
    mount(hashForFleet(SITE, { robotId: INSPECTED }))
    act(() => {
      window.history.replaceState(null, '', '#/site/site%20a/liveops')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(inspected()).toBe(INSPECTED)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

/**
 * Fleet's address names the robot and its tab (Systems into Fleet, task 2):
 * `#/site/{id}/fleet/{robotId}/{tab}`. A shared link opens what it names, a
 * click writes a new entry, and the fallbacks -- a bare address on a wide
 * screen, a robot this site does not have -- replace the address in place so
 * Back does not walk through them.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const shell = vi.hoisted(() => ({ touch: false, narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, narrow: shell.narrow, orientation: 'portrait' as const, big: false }),
}))

// Two robots with the names the brief uses, so the heading reads as the id.
const robots: RobotState[] = [
  { ...initialRobots[0], robot_id: 'rover-pi', name: 'rover-pi', site_id: 'site-dev' },
  { ...initialRobots[1], robot_id: 'rover-jetson', name: 'rover-jetson', site_id: 'site-dev' },
]
const site = vi.hoisted(() => ({ robots: [] as RobotState[] }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => site.robots }))

// The tab bodies are workspaces of their own with their own tests; what
// matters here is which one is on screen.
vi.mock('./v2/OverviewTab', () => ({ OverviewTab: () => <i data-tab-body="overview" /> }))
vi.mock('./v2/MotorsTab', () => ({ MotorsTab: () => <i data-tab-body="motors" /> }))
vi.mock('./v2/SensorsTab', () => ({ SensorsTab: () => <i data-tab-body="sensors" /> }))
vi.mock('./v2/LogsTab', () => ({ LogsTab: () => <i data-tab-body="logs" /> }))
vi.mock('./v2/TestsTab', () => ({ TestsTab: () => <i data-tab-body="tests" /> }))
vi.mock('./v2/ServiceTab', () => ({ ServiceTab: () => <i data-tab-body="service" /> }))
vi.mock('./v2/EdgeDeviceTab', () => ({ EdgeDeviceTab: () => <i data-tab-body="edge" /> }))

// The real store would start the data provider on mount.
vi.mock('@/store/useLiveOpsStore', () => {
  const state = { init: () => {}, teardown: () => {}, missions: {}, dispatchCommand: () => {} } as Record<string, unknown>
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(state)
  useLiveOpsStore.getState = () => state
  return { useLiveOpsStore }
})

import { FleetWorkspace } from './FleetWorkspace'
import { useSessionStore } from '@/store/useSessionStore'

const SITE = 'site-dev'
const FLEET = '#/site/site-dev/fleet'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot> | null = null

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<FleetWorkspace siteId={SITE} />))
}

/** Start at an address the way a pasted link would: one history entry. */
function at(hash: string) {
  window.history.replaceState(null, '', hash)
}

const heading = () => host.querySelector('[data-robot-inspector] h2')?.textContent
const roster = () => host.querySelector('[data-fleet-roster]')
const tab = (name: string) => [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === name) as HTMLButtonElement | undefined
const row = (name: string) => [...host.querySelectorAll('[data-fleet-roster] [role="listitem"]')]
  .find((b) => b.textContent?.includes(name)) as HTMLButtonElement | undefined
const backButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('touch.back.fleet')))

beforeEach(() => {
  shell.touch = false
  shell.narrow = false
  site.robots = robots
  useSessionStore.setState({ selectedRobotId: 'rover-pi', selectionPending: false, requestedRobotId: null })
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  host?.remove()
  vi.restoreAllMocks()
  at('#/')
})

describe('Fleet follows its address', () => {
  it('opens the robot and tab the address names', () => {
    at(`${FLEET}/rover-pi/motors`)
    mount()
    expect(heading()).toBe('rover-pi')
    expect(tab(i18n.t('fleet.inspector.motors'))?.getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('[data-tab-body="motors"]')).not.toBeNull()
  })

  it('offers the robot tabs in address order, Service last until it goes', () => {
    at(`${FLEET}/rover-pi`)
    mount()
    expect([...host.querySelectorAll('[role="tab"]')].map((b) => b.textContent))
      .toEqual(['Overview', 'Motors', 'Sensors', 'Motion tests', 'Logs', 'Edge device', 'Service'])
  })

  it('opens Sensors and Logs from the address', () => {
    at(`${FLEET}/rover-pi/sensors`)
    mount()
    expect(tab(i18n.t('fleet.inspector.sensors'))?.getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('[data-tab-body="sensors"]')).not.toBeNull()
    act(() => { tab(i18n.t('fleet.inspector.logs'))!.click() })
    expect(window.location.hash).toBe(`${FLEET}/rover-pi/logs`)
    expect(host.querySelector('[data-tab-body="logs"]')).not.toBeNull()
  })

  // Logs follows live by watching its own list reach the bottom, so the list
  // has to be the thing that scrolls, filling the inspector.
  it('gives Logs the full height, without the scrolling wrapper', () => {
    at(`${FLEET}/rover-pi/logs`)
    mount()
    const box = host.querySelector<HTMLElement>('[data-tab-body="logs"]')!.parentElement!
    expect(box.style.overflowY).not.toBe('auto')
    expect(box.style.display).toBe('flex')
    expect(box.style.flex).toMatch(/^1/)
    act(() => { tab(i18n.t('fleet.inspector.motors'))!.click() })
    expect(host.querySelector<HTMLElement>('[data-tab-body="motors"]')!.parentElement!.style.overflowY).toBe('auto')
  })

  it('picking a robot keeps the tab', () => {
    at(`${FLEET}/rover-pi/motors`)
    mount()
    act(() => { row('rover-jetson')!.click() })
    expect(window.location.hash).toBe('#/site/site-dev/fleet/rover-jetson/motors')
    expect(heading()).toBe('rover-jetson')
    expect(tab(i18n.t('fleet.inspector.motors'))?.getAttribute('aria-selected')).toBe('true')
  })

  it('picking a tab writes it', () => {
    at(`${FLEET}/rover-pi`)
    mount()
    act(() => { tab(i18n.t('fleet.inspector.edge'))!.click() })
    expect(window.location.hash.endsWith('/fleet/rover-pi/edge')).toBe(true)
    expect(host.querySelector('[data-tab-body="edge"]')).not.toBeNull()
  })

  // Service leaves with task 4, so it never got an address: it opens in the
  // page, and the next tab picked by the address closes it.
  it('opens Service in the page without touching the address', () => {
    at(`${FLEET}/rover-pi/motors`)
    mount()
    act(() => { tab(i18n.t('fleet.inspector.service'))!.click() })
    expect(host.querySelector('[data-tab-body="service"]')).not.toBeNull()
    expect(window.location.hash).toBe(`${FLEET}/rover-pi/motors`)
    act(() => { tab(i18n.t('fleet.inspector.motors'))!.click() })
    expect(host.querySelector('[data-tab-body="motors"]')).not.toBeNull()
  })

  it('follows the address when it changes underneath', () => {
    at(`${FLEET}/rover-pi`)
    mount()
    act(() => {
      at(`${FLEET}/rover-jetson/tests`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(heading()).toBe('rover-jetson')
    expect(host.querySelector('[data-tab-body="tests"]')).not.toBeNull()
  })

  it('wide: a bare address names the shown robot', () => {
    at(FLEET)
    useSessionStore.setState({ selectedRobotId: 'rover-jetson' })
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    const before = window.history.length
    mount()
    expect(window.location.hash).toBe('#/site/site-dev/fleet/rover-jetson')
    expect(replace).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(before)
    expect(heading()).toBe('rover-jetson')
  })

  it('an unknown robot falls back to the roster\'s first robot on a wide screen', () => {
    at(`${FLEET}/ghost/logs`)
    const before = window.history.length
    mount()
    // The roster's first robot, attention-sorted, is the one highlighted.
    const first = host.querySelector('[data-fleet-roster] [role="listitem"]')!.textContent!
    const firstId = robots.find((r) => first.includes(r.name))!.robot_id
    expect(heading()).toBe(firstId)
    expect(window.location.hash).toBe(`${FLEET}/${firstId}/logs`)
    expect(window.history.length).toBe(before)
    expect(host.querySelector('[data-tab-body="logs"]')).not.toBeNull()
  })

  it('an unknown robot shows the roster on a narrow screen', () => {
    shell.narrow = true
    at(`${FLEET}/ghost/logs`)
    mount()
    expect(roster()).not.toBeNull()
    expect(heading()).toBeUndefined()
    expect(window.location.hash).toBe(FLEET)
  })

  it('leaves the address alone while the site\'s robots are still loading', () => {
    site.robots = []
    at(`${FLEET}/rover-pi/motors`)
    mount()
    expect(window.location.hash).toBe(`${FLEET}/rover-pi/motors`)
    site.robots = robots
    act(() => root!.render(<FleetWorkspace siteId={SITE} />))
    expect(heading()).toBe('rover-pi')
    expect(window.location.hash).toBe(`${FLEET}/rover-pi/motors`)
  })

  it('narrow: a bare address is the roster, whatever the session has selected', () => {
    shell.narrow = true
    at(FLEET)
    mount()
    expect(roster()).not.toBeNull()
    expect(heading()).toBeUndefined()
    expect(window.location.hash).toBe(FLEET)
    expect(backButton()).toBeUndefined()
  })
})

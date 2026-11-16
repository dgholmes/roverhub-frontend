// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { RobotState } from '@/types'
import type { LogBatch, LogLine } from '@/types/logs'
import { ApiError } from '@/lib/realtime/apiError'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider, robots } = vi.hoisted(() => ({
  provider: {
    subscribeRobotLogs: vi.fn(),
    requestRobotLogs: vi.fn(),
  },
  robots: { current: [] as unknown[] },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => robots.current }))
// SystemsWorkspace starts the live feed; these tests drive the provider by hand.
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (pick: (s: { init: () => void; teardown: () => void }) => unknown) => pick({ init: () => {}, teardown: () => {} }),
}))

import { LogsPage } from './LogsPage'
import { SystemsWorkspace } from './SystemsWorkspace'

const robot = (robot_id: string, name: string, bridge: 'connected' | 'offline' = 'connected') =>
  ({ robot_id, name, site_id: 'site-dev', connectivity: { bridge_state: bridge } }) as unknown as RobotState

const line = (min: number, message: string, over: Partial<LogLine> = {}): LogLine => ({
  at: new Date(Date.now() - 60 * 60_000 + min * 60_000).toISOString(), source: 'bridge', level: 'info',
  logger: 'robot_bridge.nav_goals', message, repeat: 1, last_at: null, ...over,
})

let host: HTMLDivElement
let root: Root
/** robot_id -> the listener the page subscribed with. */
let listeners: Map<string, (b: LogBatch) => void>
let tickets: number

const send = (robotId: string, over: Partial<LogBatch>) => act(() => {
  listeners.get(robotId)?.({ robot_id: robotId, site_id: 'site-dev', request_id: null, lines: [], done: false, truncated: false, error: null, ...over })
})
const settle = () => act(async () => { await Promise.resolve() })
const text = () => host.textContent ?? ''
const chip = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name)!
const select = (label: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
const change = (el: HTMLSelectElement, value: string) => act(() => {
  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true }))
})

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  listeners = new Map()
  tickets = 0
  provider.subscribeRobotLogs.mockReset().mockImplementation((id: string, l: (b: LogBatch) => void) => {
    listeners.set(id, l)
    return () => { if (listeners.get(id) === l) listeners.delete(id) }
  })
  provider.requestRobotLogs.mockReset().mockImplementation(async () => ({ requestId: `req-${++tickets}`, since: '' }))
  robots.current = [robot('rover-pi', 'rover-pi', 'offline'), robot('rover-jetson', 'rover-jetson')]
  try { localStorage.clear() } catch { /* none */ }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const open = async () => {
  act(() => root.render(<LogsPage siteId="site-dev" />))
  await settle()
}

describe('Systems › Logs', () => {
  it('opens on the first online robot, listening before it asks for the last hour', async () => {
    await open()
    expect(provider.subscribeRobotLogs).toHaveBeenCalledWith('rover-jetson', expect.any(Function))
    expect(provider.requestRobotLogs).toHaveBeenCalledWith('rover-jetson', { sinceHours: 1 })
    expect(provider.subscribeRobotLogs.mock.invocationCallOrder[0]).toBeLessThan(provider.requestRobotLogs.mock.invocationCallOrder[0])
    expect(text()).toContain(i18n.t('systems.logs.loading', { robot: 'rover-jetson' }))
    expect(text()).toContain(i18n.t('systems.logs.footnote'))
  })

  it('shows the answer and live lines as one list, with Nav2 behind its chip', async () => {
    await open()
    send('rover-jetson', { lines: [line(55, 'live: nav goal succeeded')] })
    send('rover-jetson', { request_id: 'req-1', done: true, lines: [
      line(10, 'command received: NAV_GOTO'),
      line(11, 'AMCL cannot publish a pose', { source: 'nav', level: 'warn', logger: 'amcl', repeat: 412, last_at: new Date().toISOString() }),
    ] })
    const rows = () => [...host.querySelectorAll('[role="row"][data-level]')].map((r) => r.textContent)
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toContain('command received: NAV_GOTO')
    expect(rows()[1]).toContain('live: nav goal succeeded')
    expect(text()).not.toContain('AMCL')

    act(() => chip(i18n.t('systems.logs.source.nav')).click())
    expect(rows()).toHaveLength(3)
    const pill = [...host.querySelectorAll('span')].find((s) => s.textContent === '×412')!
    expect(pill.title).toMatch(/^Logged 412 times in a row, last at \d\d:\d\d:\d\d\.\d\d$/)

    act(() => chip(i18n.t('systems.logs.level.info')).click())
    expect(rows()).toHaveLength(1)
  })

  it('searches message and logger text', async () => {
    await open()
    send('rover-jetson', { request_id: 'req-1', done: true, lines: [line(1, 'command received: NAV_GOTO'), line(2, 'nav goal 2 accepted')] })
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ACCEPTED')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const rows = [...host.querySelectorAll('[role="row"][data-level]')]
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('nav goal 2 accepted')
  })

  it('asks again when the range or the robot changes, and remembers the robot', async () => {
    await open()
    change(select(i18n.t('systems.logs.rangeAria')), '24')
    await settle()
    expect(provider.requestRobotLogs).toHaveBeenLastCalledWith('rover-jetson', { sinceHours: 24 })
    change(select(i18n.t('systems.logs.robotAria')), 'rover-pi')
    await settle()
    expect(provider.requestRobotLogs).toHaveBeenLastCalledWith('rover-pi', { sinceHours: 24 })
    expect(provider.subscribeRobotLogs).toHaveBeenLastCalledWith('rover-pi', expect.any(Function))
    expect(listeners.has('rover-jetson')).toBe(false)
    expect(localStorage.getItem('rh.systems.logs.robot.site-dev')).toBe('rover-pi')
  })

  it('answers an empty history in words', async () => {
    await open()
    send('rover-jetson', { request_id: 'req-1', done: true })
    expect(text()).toContain(i18n.t('systems.logs.empty.1'))
  })

  it('says how many Nav2 lines a filter hides when nothing else is left', async () => {
    await open()
    send('rover-jetson', { request_id: 'req-1', done: true, lines: [line(1, 'AMCL cannot publish a pose', { source: 'nav', level: 'warn' })] })
    expect(text()).toContain(i18n.t('systems.logs.noMatch'))
    expect(text()).toContain(i18n.t('systems.logs.navHidden', { count: 1 }))
  })

  it('shows the backend\'s words when the robot is offline', async () => {
    provider.requestRobotLogs.mockRejectedValue(new ApiError(409, { detail: 'rover-jetson is offline, so its log can\'t be read' }, 'x'))
    await open()
    expect(text()).toContain('rover-jetson is offline, so its log can\'t be read')
    expect(text()).toContain(i18n.t('systems.logs.offlineHint'))
  })

  it('shows any other refusal with its detail', async () => {
    provider.requestRobotLogs.mockRejectedValue(new ApiError(503, { detail: 'could not send the log request to the broker (rc=4); the robot was not asked' }, 'x'))
    await open()
    expect(text()).toContain('the robot was not asked')
  })

  it('gives up waiting after 10 s and says why it may be', async () => {
    vi.useFakeTimers()
    await open()
    await act(async () => { vi.advanceTimersByTime(9_900) })
    expect(text()).not.toContain('No answer')
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(text()).toContain(i18n.t('systems.logs.noAnswer', { robot: 'rover-jetson' }))
    expect(text()).toContain('0.0.22')
  })

  it('shows the device\'s own error, and the truncated note', async () => {
    await open()
    send('rover-jetson', { request_id: 'req-1', truncated: true, lines: [line(1, 'a')] })
    send('rover-jetson', { request_id: 'req-1', done: true, error: 'journalctl: permission denied' })
    expect(text()).toContain('journalctl: permission denied')
    expect(text()).toContain(i18n.t('systems.logs.deviceErrorHint', { robot: 'rover-jetson' }))
    expect(text()).toContain(i18n.t('systems.logs.truncated'))
  })

  it('shows an error-only answer verbatim instead of an empty log', async () => {
    await open()
    send('rover-jetson', { request_id: 'req-1', done: true, error: 'Failed to open journal: Permission denied' })
    expect(text()).toContain('Failed to open journal: Permission denied')
    expect(text()).not.toContain(i18n.t('systems.logs.empty.1'))
  })

  it('says so when the site has no robots', async () => {
    robots.current = []
    await open()
    expect(text()).toContain(i18n.t('systems.logs.noRobots'))
    expect(provider.requestRobotLogs).not.toHaveBeenCalled()
  })

  it('names the robot instead of a picker when there is only one', async () => {
    robots.current = [robot('rover-jetson', 'rover-jetson')]
    await open()
    expect(host.querySelector('select[aria-label="' + i18n.t('systems.logs.robotAria') + '"]')).toBeNull()
    expect(host.querySelector('h2')?.textContent).toBe('rover-jetson')
  })
})

describe('the Systems workspace', () => {
  it('opens on Logs and gives the bare address the page\'s name', async () => {
    window.history.replaceState(null, '', '#/site/site-dev/systems')
    act(() => root.render(<SystemsWorkspace siteId="site-dev" />))
    await settle()
    expect(window.location.hash).toBe('#/site/site-dev/systems/logs')
    expect(text()).toContain(i18n.t('systems.pages.logs'))
    expect(provider.requestRobotLogs).toHaveBeenCalled()
  })
})

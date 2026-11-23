// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { OrgSite } from '@/org/sites'
import type { RobotState } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { rights, move } = vi.hoisted(() => ({
  /** Sites where this person may `configure`. */
  rights: { sites: new Set<string>() },
  move: vi.fn(),
}))
vi.mock('@/org/useCan', () => ({
  useCanAt: (id: string) => (siteId: string) => id === 'configure' && rights.sites.has(siteId),
}))
vi.mock('@/org/robotSite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/org/robotSite')>()),
  setRobotSite: move,
}))

import { MoveSiteAction } from './MoveRobotSite'

const SITES: OrgSite[] = [
  { id: 'site-dev', name: 'Office', discovered: false },
  { id: 'site-mall', name: 'Mall', discovered: false },
  { id: 'site-yard', name: 'site-yard', discovered: true },
  { id: 'site-far', name: 'Far away', discovered: false },
]

/** A live, idle 0.0.29 robot at site-dev. */
const robot = (over: Partial<RobotState> = {}, schema = '0.0.29') => ({
  ...initialRobots[1], robot_id: 'rover-pi', name: 'Rover Pi', site_id: 'site-dev', abstract_state: 'STAND',
  control_owner: null, active_run: null, nav_goal: null,
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected' },
  bridge: { ...initialRobots[1].bridge!, schema_version: schema, last_heartbeat_at: new Date().toISOString() },
  ...over,
}) as RobotState

let host: HTMLDivElement
let root: Root
const page = () => document.body.textContent ?? ''
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click() })
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
const render = (r: RobotState) => act(() => root.render(<MoveSiteAction robot={r} sites={SITES} />))
const select = () => document.body.querySelector<HTMLSelectElement>('select[data-move-site]')
const choose = (value: string) => act(() => {
  const el = select()!
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
})

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  rights.sites = new Set(['site-dev', 'site-mall', 'site-yard'])
  move.mockReset()
  move.mockResolvedValue({ ok: true, error: null })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Move to site (SET_SITE)', () => {
  it("Move to site lists the organisation's sites and sends SET_SITE", async () => {
    render(robot())
    click(button('Move to site…'))
    const options = [...select()!.options].filter((o) => o.value).map((o) => [o.value, o.disabled])
    // Every site but the robot's own; one this person may not configure is shown, not offered.
    expect(options).toEqual([['site-mall', false], ['site-yard', false], ['site-far', true]])
    expect(page()).toContain('Far away — needs the engineer role there')
    // Plain words: it restarts, arrives with no map, and Use this map comes next.
    expect(page()).toContain('no map')
    expect(page()).toContain('Use this map')
    expect(button('Move')!.disabled).toBe(true)
    choose('site-mall')
    click(button('Move'))
    await settle()
    expect(move).toHaveBeenCalledWith('rover-pi', 'site-mall')
    expect(page()).toContain('Rover Pi is restarting at Mall')
  })

  it('says why the robot did not move', async () => {
    move.mockResolvedValue({ ok: false, error: 'The robot is walking to a point.' })
    render(robot())
    click(button('Move to site…'))
    choose('site-yard')
    click(button('Move'))
    await settle()
    expect(page()).toContain('Not moved: The robot is walking to a point.')
  })

  it.each([
    ['offline', robot({ connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } }), 'The robot is offline.'],
    ['in E-Stop', robot({ abstract_state: 'E_STOP' }), 'The robot is in E-Stop.'],
    ['on a mission', robot({ control_owner: 'mission:run-1' }), 'The robot is on a mission.'],
    ['walking', robot({ nav_goal: { state: 'active' } as RobotState['nav_goal'] }), 'The robot is walking to a goal.'],
    ['on an old bridge', robot({}, '0.0.28'), 'needs schema 0.0.29'],
    ['held by a person', robot({ control_owner: 'operator-1' }), 'Someone has control of the robot. Release control first'],
  ])('is not offered while the robot is %s, and says so', (_case, r, words) => {
    render(r)
    expect(button('Move to site…')!.disabled).toBe(true)
    expect(page()).toContain(words)
  })

  it('is only for people who may configure the robot’s site', () => {
    rights.sites = new Set(['site-mall'])
    render(robot())
    expect(button('Move to site…')).toBeUndefined()
  })

  it('says so when there is nowhere else to go', () => {
    act(() => root.render(<MoveSiteAction robot={robot()} sites={SITES.slice(0, 1)} />))
    click(button('Move to site…'))
    expect(page()).toContain('There is no other site to move it to.')
    expect(button('Move')!.disabled).toBe(true)
  })
})

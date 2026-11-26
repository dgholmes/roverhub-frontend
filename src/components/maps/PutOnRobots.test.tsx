// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { robots, perms, send, use, shell } = vi.hoisted(() => ({
  robots: { current: [] as unknown[] },
  perms: { configure: true },
  send: vi.fn(),
  use: vi.fn(),
  shell: { narrow: false },
}))
vi.mock('./useProviderRobots', () => ({ useProviderRobots: () => robots.current }))
vi.mock('@/org/useCan', () => ({ useCan: (id: string) => (id === 'configure' ? perms.configure : true) }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: false, orientation: 'landscape' as const, big: true, narrow: shell.narrow }),
}))
// The two commands, as the Robot maps rows sent them (robotMaps.ts).
vi.mock('./robotMaps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./robotMaps')>()),
  sendMapToRobot: send,
  sendUseNavMap: use,
}))

import { PutOnRobots, PutOnRobotsButton, PutOnRobotsDialog } from './PutOnRobots'

const FLOOR = 'f'.repeat(64)
const OLD = '0'.repeat(64)
const map: SiteMap = {
  map_id: 'map-office', site_id: 'site-dev', name: 'Office', source: 'slam', extent_min: [0, 0], extent_max: [10, 10],
  created_at: '', updated_at: '', geodetic_anchor: null, status: 'active', zones: [],
  floors: [{
    index: 0, label: null, floor_z_m: 0, resolution_m: 0.05, origin_xy_m: [0, 0], size_cells: [200, 200],
    free_cells: 1, occupied_cells: 1, unknown_cells: 1, content_hash: FLOOR,
  }],
}
const yard: SiteMap = { ...map, map_id: 'map-yard', name: 'Yard' }

/** A live, standing 0.0.29 robot on this site, set up for `navMap` with `hash`. */
const robot = (robot_id: string, navMap: string | null, hash: string | null, over: Partial<RobotState> = {}, schema = '0.0.29') => ({
  ...initialRobots[1], robot_id, name: robot_id, site_id: 'site-dev', abstract_state: 'STAND', control_owner: null,
  active_run: null, nav_goal: null,
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected' },
  bridge: {
    ...initialRobots[1].bridge!, schema_version: schema, last_heartbeat_at: new Date().toISOString(),
    nav_map_id: navMap, nav_map_hash: hash,
  },
  ...over,
}) as RobotState

/** One robot in each state the chooser knows. */
const everyState = () => [
  robot('r-same', 'map-office', FLOOR),
  robot('r-differs', 'map-office', OLD),
  robot('r-other', 'map-yard', OLD),
  robot('r-none', null, null),
  robot('r-offline', 'map-office', OLD, { connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } }),
  robot('r-mission', 'map-yard', OLD, { abstract_state: 'AUTO_MISSION' }),
  robot('r-old', 'map-yard', OLD, {}, '0.0.28'),
  robot('r-unknown', 'map-office', null),
  robot('r-far', 'map-office', OLD, { site_id: 'site-other' }),
]

let host: HTMLDivElement
let root: Root
const body = () => document.body
const dialog = () => body().querySelector<HTMLElement>('[data-put-on-robots]')
const row = (id: string) => dialog()?.querySelector<HTMLElement>(`[data-robot="${id}"]`) ?? null
const box = (id: string) => row(id)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
const ticked = () => [...dialog()!.querySelectorAll<HTMLElement>('[data-robot]')].filter((r) => r.querySelector<HTMLInputElement>('input')!.checked).map((r) => r.dataset.robot)
const buttonIn = (scope: Element | null, name: string) =>
  [...(scope ?? body()).querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const go = () => dialog()!.querySelector<HTMLButtonElement>('[data-put-go]')!
const click = (el: Element | undefined | null) => act(() => { (el as HTMLElement).click() })
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })

const renderDialog = (preselect: string | null = null, session = 1, open = true) => act(() => root.render(
  <StrictMode>
    <PutOnRobotsDialog map={map} floorIndex={0} maps={[map, yard]} open={open} session={session} preselect={preselect} onClose={() => {}} />
  </StrictMode>,
))

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  perms.configure = true
  shell.narrow = false
  send.mockReset()
  use.mockReset()
  robots.current = everyState()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the pinned "Put on robots…"', () => {
  const action = () => host.querySelector<HTMLElement>('[data-put-on-robots-action]')!
  const button = () => action().querySelector('button')!
  const render = () => act(() => root.render(<PutOnRobotsButton map={map} floorIndex={0} onOpen={opened} />))
  const opened = vi.fn()
  beforeEach(() => opened.mockReset())

  it('is the primary action, in plain words, and opens the chooser', () => {
    render()
    expect(button().textContent).toBe('Put on robots…')
    expect(button().className).toContain('rh-btn--primary')
    expect(button().disabled).toBe(false)
    click(button())
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('is off with the role it needs for someone without configure, and says why', () => {
    perms.configure = false
    render()
    expect(action().dataset.putOnRobotsAction).toBe('off')
    expect(button().disabled).toBe(true)
    expect(action().querySelector('[data-put-why]')!.textContent).toBe('Sending a map to a robot needs the engineer role.')
    expect(button().getAttribute('title')).toBe('Sending a map to a robot needs the engineer role.')
  })

  it('is off at a site with no robot, and on a floor with no version', () => {
    robots.current = []
    render()
    expect(button().disabled).toBe(true)
    expect(action().textContent).toContain('No robot at this site yet.')
    robots.current = everyState()
    act(() => root.render(<PutOnRobotsButton map={{ ...map, floors: [{ ...map.floors[0], content_hash: null }] }} floorIndex={0} onOpen={opened} />))
    expect(button().disabled).toBe(true)
    expect(action().textContent).toContain('This floor has no version yet')
  })

  it('in Korean, reads 로봇에 적용…', async () => {
    await i18n.changeLanguage('ko')
    try {
      render()
      expect(button().textContent).toBe('로봇에 적용…')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('the chooser', () => {
  it("lists the site's robots, each with what it would get, and the reason when it cannot", () => {
    renderDialog()
    const state = (id: string) => row(id)!.dataset.putState
    expect(state('r-same')).toBe('upToDate')
    expect(state('r-differs')).toBe('update')
    expect(state('r-other')).toBe('switch')
    expect(state('r-none')).toBe('switch')
    expect(state('r-offline')).toBe('offline')
    expect(state('r-mission')).toBe('busy')
    expect(state('r-old')).toBe('cannot')
    expect(state('r-unknown')).toBe('unknown')
    expect(row('r-far')).toBeNull()
    expect(row('r-same')!.textContent).toContain('Up to date')
    expect(row('r-differs')!.textContent).toContain('Will be updated')
    expect(row('r-other')!.textContent).toContain('Will switch to this map')
    expect(row('r-other')!.textContent).toContain('Set up for Yard')
    expect(row('r-offline')!.textContent).toContain('Offline')
    expect(row('r-offline')!.querySelector('[data-put-reason]')!.textContent).toBe('The robot is offline.')
    expect(row('r-mission')!.textContent).toContain('Busy')
    expect(row('r-mission')!.querySelector('[data-put-reason]')!.textContent).toBe('The robot is on a mission.')
    expect(row('r-old')!.textContent).toContain("Can't take this map")
    expect(row('r-old')!.querySelector('[data-put-reason]')!.textContent).toContain('0.0.29')
  })

  it('ticks the robots that need it, and only those can be ticked', () => {
    renderDialog()
    expect(ticked()).toEqual(['r-differs', 'r-other', 'r-none'])
    for (const id of ['r-same', 'r-offline', 'r-mission', 'r-old', 'r-unknown']) expect(box(id).disabled).toBe(true)
    expect(go().textContent).toBe('Put on 3 robots')
  })

  it('with a robot asked for (the Setup checklist), ticks only that one', () => {
    renderDialog('r-other')
    expect(ticked()).toEqual(['r-other'])
    expect(go().textContent).toBe('Put on 1 robot')
    // Its switch note: navigation restarts, then Set position.
    expect(dialog()!.textContent).toContain('restarts its navigation')
  })

  it('"Select all that need it" and "Clear"', () => {
    renderDialog('r-differs')
    click(buttonIn(dialog(), 'Clear'))
    expect(ticked()).toEqual([])
    expect(go().disabled).toBe(true)
    expect(go().textContent).toBe('Choose robots')
    click(buttonIn(dialog(), 'Select all that need it'))
    expect(ticked()).toEqual(['r-differs', 'r-other', 'r-none'])
    click(box('r-none'))
    expect(ticked()).toEqual(['r-differs', 'r-other'])
  })

  it('sends each robot its own command with the params the rows used: SYNC_MAP to update, USE_NAV_MAP to switch', async () => {
    send.mockResolvedValue({ result: 'completed', command: { result: { map_hash: FLOOR, relocalise: true } } })
    use.mockResolvedValue({ result: 'completed', command: { result: { map_hash: FLOOR, relocalise: true } } })
    renderDialog()
    click(go())
    await settle()
    const params = { map_id: 'map-office', floor_index: 0, map_hash: FLOOR }
    expect(send.mock.calls).toEqual([['r-differs', params]])
    expect(use.mock.calls.map((c) => c[0]).sort()).toEqual(['r-none', 'r-other'])
    for (const c of use.mock.calls) expect(c[1]).toEqual(params)
    // Nothing went to a robot that was up to date, or blocked.
    expect([...send.mock.calls, ...use.mock.calls].map((c) => c[0])).not.toContain('r-offline')
  })

  it("shows each robot's answer: sent, refused with the reason, failed; and the failures stay", async () => {
    send.mockResolvedValue({ result: 'completed', command: { result: { map_hash: FLOOR, relocalise: true } } })
    use.mockImplementation(async (id: string) => (id === 'r-other'
      ? { result: 'failed', command: { current_stage: 'execution_failed', failure_reason: 'REJECTED_NAV_GOAL_ACTIVE: a goal is active' } }
      : { result: 'failed', command: { current_stage: 'execution_failed', failure_reason: 'sending the map failed: hash mismatch' } }))
    renderDialog()
    click(go())
    expect(row('r-differs')!.textContent).toContain('Sending…')
    expect(row('r-other')!.textContent).toContain('Loading the map on the robot…')
    await settle()
    expect(row('r-differs')!.querySelector('[data-put-result]')!.getAttribute('data-put-result')).toBe('ok')
    expect(row('r-differs')!.textContent).toContain('Sent.')
    expect(row('r-differs')!.textContent).toContain('Set its position again.')
    expect(row('r-other')!.querySelector('[data-put-result]')!.getAttribute('data-put-result')).toBe('refused')
    expect(row('r-other')!.textContent).toContain('Refused: ' + i18n.t('command.refusal.code.REJECTED_NAV_GOAL_ACTIVE'))
    expect(row('r-none')!.querySelector('[data-put-result]')!.getAttribute('data-put-result')).toBe('failed')
    expect(row('r-none')!.textContent).toContain('Not loaded: hash mismatch')
    // A sent robot is held until its registration brings the new version; a
    // failed one may be tried again.
    expect(row('r-differs')!.dataset.putState).toBe('held')
    expect(box('r-differs').disabled).toBe(true)
    expect(box('r-other').disabled).toBe(false)
    expect(buttonIn(dialog(), 'Close')).toBeTruthy()
    // The failures are still there after another tick.
    await settle()
    expect(row('r-other')!.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('a switch that worked offers Set position', async () => {
    robots.current = [robot('r-other', 'map-yard', OLD)]
    use.mockResolvedValue({ result: 'completed', command: { result: { map_hash: FLOOR, relocalise: true } } })
    renderDialog()
    click(go())
    await settle()
    expect(row('r-other')!.textContent).toContain('The robot now uses this map.')
    expect(buttonIn(row('r-other'), 'Set position')).toBeTruthy()
  })

  it('stops offering a robot that becomes blocked, and never sends to it', () => {
    renderDialog()
    robots.current = everyState().map((r) => (r.robot_id === 'r-differs' ? { ...r, abstract_state: 'E_STOP' } as RobotState : r))
    renderDialog()
    expect(row('r-differs')!.dataset.putState).toBe('busy')
    expect(ticked()).toEqual(['r-other', 'r-none'])
    expect(go().textContent).toBe('Put on 2 robots')
  })

  it('without configure, nothing can be ticked and the role is named', () => {
    perms.configure = false
    renderDialog()
    expect(ticked()).toEqual([])
    expect(row('r-differs')!.querySelector('[data-put-reason]')!.textContent).toBe('Sending a map to a robot needs the engineer role.')
    expect(go().disabled).toBe(true)
  })

  it('is a full-width sheet on a narrow screen, a dialog otherwise, with no hairlines', () => {
    renderDialog()
    expect(dialog()!.dataset.sheet).toBeUndefined()
    expect(dialog()!.innerHTML).not.toMatch(/border(-left)?:\s*1(\.5)?px solid/)
    shell.narrow = true
    renderDialog(null, 2)
    expect(dialog()!.dataset.sheet).toBe('true')
    expect(dialog()!.className).toContain('bottom-0')
    expect(dialog()!.className).toContain('max-w-none')
  })
})

describe('the button and chooser together (the survey finishing screen)', () => {
  it('opens the chooser from the button, and Cancel closes it without sending', () => {
    act(() => root.render(<PutOnRobots map={map} floorIndex={0} maps={[map, yard]} />))
    expect(dialog()).toBeNull()
    click(host.querySelector('[data-put-on-robots-action] button'))
    expect(dialog()).not.toBeNull()
    click(buttonIn(dialog(), 'Cancel'))
    expect(dialog()).toBeNull()
    expect(send).not.toHaveBeenCalled()
    expect(use).not.toHaveBeenCalled()
  })
})

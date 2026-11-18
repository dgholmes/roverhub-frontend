// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { Command, RobotState } from '@/types'
import type { NavGoalStatus, NavStuck } from '@/types/robotState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (select: (s: { dispatchCommandAsync: typeof send }) => unknown) => select({ dispatchCommandAsync: send }),
}))
vi.mock('leaflet', () => ({ default: { divIcon: (o: unknown) => o } }))
vi.mock('react-leaflet', () => ({ Polyline: () => null, CircleMarker: () => null, Marker: () => null }))

import { NavStuckCard, useNavStuck, type NavStuckState } from './NavStuckLayer'
import { NavStuckPolicySection } from './NavStuckPolicy'

const STUCK: NavStuck = {
  reason: 'no_progress', since: new Date(Date.now() - 5_000).toISOString(), decide_by: new Date(Date.now() + 55_000).toISOString(),
  failed_route: [[0, 0], [2, 0], [6, 0]], stuck_at: [2, 0],
  routes: [
    { option_id: 'A', points: [[2, 0], [2, 2], [6, 2], [6, 0]], length_m: 10.4, est_s: 35, end: [6, 0] },
    { option_id: 'B', points: [[2, 0], [2, -4], [6, -4], [6, 0]], length_m: 17, est_s: 57, end: [6, 0] },
  ],
  nearest: null,
  back: { option_id: 'back', points: [[2, 0], [0, 0]], length_m: 4.8, est_s: null, end: [0, 0] },
}
const goal = (over: Partial<NavGoalStatus> = {}): NavGoalStatus => ({
  goal_id: 'g1', x_m: 6, y_m: 0, yaw_rad: null, map_id: 'map-venue-survey', state: 'stuck', reason: null,
  updated_at: 't', stuck: STUCK, ...over,
})
const robotWith = (over: Partial<RobotState> = {}): RobotState => ({
  ...initialRobots[1], abstract_state: 'STAND', sdk_state: 'balance_stand', control_owner: 'nav:g1', active_run: null,
  nav_goal: goal(), nav_stuck_policy: 'ask', ...over,
})

let host: HTMLDivElement
let root: Root
let seen: NavStuckState | null = null
const text = () => host.textContent ?? ''
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const row = (id: string) => host.querySelector<HTMLElement>(`[data-route="${id}"]`)
const settle = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve() })

function Harness({ robot }: { robot: RobotState }) {
  const state = useNavStuck(robot, true)
  seen = state
  return <NavStuckCard robot={robot} map={undefined} floor={undefined} state={state} />
}
const render = (robot: RobotState) => act(() => root.render(<StrictMode><Harness robot={robot} /></StrictMode>))

const ack = (result: 'completed' | 'failed', failure_reason?: string) =>
  Promise.resolve({ result, command: { failure_reason } as unknown as Command })

beforeAll(async () => { await i18n.changeLanguage('ko') })
beforeEach(() => {
  send.mockReset()
  send.mockImplementation(() => ack('completed'))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  seen = null
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('NavStuckCard', () => {
  it('says the way is blocked and why, and lists A, B and the way back, each with its drawing', () => {
    render(robotWith())
    expect(text()).toContain('길이 막혔습니다')
    expect(text()).toContain('30초 동안 앞으로 가지 못했습니다')
    expect(host.querySelectorAll('[data-route-thumb]')).toHaveLength(3)
    expect(row('A')?.textContent).toContain('가장 짧음')
    expect(row('A')?.textContent).toContain('10.4 m · 약 35초')
    expect(row('back')?.textContent).toContain('이 걷기를 끝내고 돌아갑니다')
    expect(row('B')?.textContent).not.toContain('가장 짧음')
    expect(button('A로 가기')).toBeDefined()
    expect(button('다시 시도')).toBeDefined()
    expect(button('취소')).toBeDefined()
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(text()).toContain('1분 안에 고르지 않으면 멈춥니다')
    // Tints and dots, never an outline.
    expect(host.innerHTML).not.toMatch(/border(-left)?:\s*1(\.5)?px solid/)
  })

  it('makes the row pointed at the map’s focus, and a click picks it', () => {
    render(robotWith())
    expect(seen?.view?.focus).toBe('A')
    act(() => { row('B')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    expect(seen?.view?.focus).toBe('B')
    act(() => { row('B')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(seen?.view?.focus).toBe('A')
    act(() => row('B')!.click())
    expect(row('B')?.getAttribute('aria-pressed')).toBe('true')
    expect(seen?.view?.focus).toBe('B')
    expect(button('B로 가기')).toBeDefined()
  })

  it('sends the picked route, Retry and Cancel as NAV_RESOLVE for this walk', async () => {
    render(robotWith())
    act(() => row('B')!.click())
    act(() => button('B로 가기')!.click())
    await settle()
    act(() => button('다시 시도')!.click())
    await settle()
    act(() => button('취소')!.click())
    await settle()
    expect(send.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      ['NAV_RESOLVE', { goal_id: 'g1', choice: 'route', option_id: 'B' }],
      ['NAV_RESOLVE', { goal_id: 'g1', choice: 'retry' }],
      ['NAV_RESOLVE', { goal_id: 'g1', choice: 'cancel' }],
    ])
  })

  it('says why the robot refused the answer', async () => {
    send.mockImplementation(() => ack('failed', 'REJECTED_NAV_NOT_STUCK: the walk is not waiting'))
    render(robotWith())
    act(() => button('A로 가기')!.click())
    await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('보내지 못했습니다: 걷기가 더 이상 선택을 기다리지 않습니다')
  })

  it('is read only for anyone else while a person holds control, and says who', () => {
    render(robotWith({ control_owner: 'kim' }))
    expect(button('A로 가기')).toBeUndefined()
    expect(button('취소')).toBeUndefined()
    expect(text()).toContain('제어권을 가진 kim만 고를 수 있습니다.')
    // The routes still read, and still point at the map.
    expect(host.querySelectorAll('[data-route-thumb]')).toHaveLength(3)
  })

  it('keeps the routes and says why when the minute ran out, until closed', () => {
    render(robotWith())
    render(robotWith({ nav_goal: goal({ state: 'aborted', reason: 'stuck_timeout', stuck: null }), control_owner: null }))
    expect(text()).toContain('걷기가 멈췄습니다')
    expect(text()).toContain('멈춤: 1분 안에 다른 길을 고르지 않음')
    expect(host.querySelectorAll('[data-route-thumb]')).toHaveLength(3)
    expect(button('A로 가기')).toBeUndefined()
    expect(host.querySelector('[role="progressbar"]')).toBeNull()
    act(() => button('닫기')!.click())
    expect(host.innerHTML).toBe('')
  })

  it('keeps one view across telemetry frames, so the map and the scene redraw nothing', () => {
    const robot = robotWith()
    render(robot)
    const first = seen?.view
    render({ ...robot, battery: { ...robot.battery, percent: 93 } })
    expect(seen?.view).toBe(first)
  })

  it('shows nothing for a walk that is not stuck', () => {
    render(robotWith({ nav_goal: goal({ state: 'active', stuck: null }) }))
    expect(host.innerHTML).toBe('')
  })
})

describe('NavStuckPolicySection', () => {
  const renderPolicy = (robot: RobotState) => act(() => root.render(<StrictMode><NavStuckPolicySection robot={robot} /></StrictMode>))
  const tab = (name: string) => [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement

  it('shows the robot’s choice and its hint, and sends a new one', async () => {
    renderPolicy(robotWith())
    expect(text()).toContain('걷기 › 길이 막히면')
    expect(tab('물어보기').getAttribute('aria-selected')).toBe('true')
    expect(text()).toContain('다른 길들을 지도에 그리고 고를 때까지 기다립니다.')
    act(() => tab('멈추기').click())
    expect(send).toHaveBeenCalledWith(initialRobots[1].robot_id, 'SET_NAV_STUCK_POLICY', expect.any(String), { policy: 'stop' })
    expect(tab('멈추기').getAttribute('aria-selected')).toBe('true')
    await settle()
    // Acked; the robot's /state now says it too.
    renderPolicy(robotWith({ nav_stuck_policy: 'stop' }))
    expect(text()).toContain('바로 멈추고 알려 드립니다.')
  })

  it('goes back and says why when the robot refuses', async () => {
    send.mockImplementation(() => ack('failed', 'REJECTED_INVALID_PARAMS: policy must be ask, auto or stop'))
    renderPolicy(robotWith())
    act(() => tab('로봇이 정하기').click())
    await settle()
    expect(tab('물어보기').getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/^바꾸지 못했습니다:/)
  })

  it('is not offered by an older bridge', () => {
    renderPolicy(robotWith({ nav_stuck_policy: null }))
    expect(host.innerHTML).toBe('')
  })
})

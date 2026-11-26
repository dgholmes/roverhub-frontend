// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { robots, perms } = vi.hoisted(() => ({
  robots: { current: [] as unknown[] },
  perms: { configure: true },
}))
// The robots as the page reads them: one source with the checklist above.
vi.mock('./useProviderRobots', () => ({ useProviderRobots: () => robots.current }))
vi.mock('@/org/useCan', () => ({ useCan: (id: string) => (id === 'configure' ? perms.configure : true) }))

import { MapRobotsSection } from './MapRobotsSection'

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

/** A live, standing 0.0.26 robot on this site, set up for map-office. */
const robot = (robot_id: string, hash: string | null, over: Partial<RobotState> = {}, navMap = 'map-office') => ({
  ...initialRobots[1], robot_id, name: robot_id, site_id: 'site-dev', abstract_state: 'STAND', control_owner: null,
  active_run: null, nav_goal: null,
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected' },
  bridge: {
    ...initialRobots[1].bridge!, schema_version: '0.0.26', last_heartbeat_at: new Date().toISOString(),
    nav_map_id: navMap, nav_map_hash: hash,
  },
  ...over,
}) as RobotState

let host: HTMLDivElement
let root: Root
const text = () => host.textContent ?? ''
const row = (id: string) => host.querySelector<HTMLElement>(`[data-robot="${id}"]`)
/** Why a row offers what it does: behind its info button, not a paragraph. */
const why = (id: string) => row(id)?.querySelector('[data-why]')?.getAttribute('title') ?? ''
const button = (scope: Element | null, name: string) =>
  [...(scope ?? host).querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click() })
const summary = () => host.querySelector('[data-robot-summary]')?.textContent ?? ''
const rows = () => [...host.querySelectorAll<HTMLElement>('[data-robot]')].map((r) => r.dataset.robot)
const render = () => act(() => root.render(<StrictMode><MapRobotsSection map={map} floorIndex={0} maps={[map, yard]} /></StrictMode>))

beforeAll(async () => { await i18n.changeLanguage('ko') })
beforeEach(() => {
  perms.configure = true
  robots.current = [
    robot('rover-jetson', OLD),
    robot('rover-pi', FLOOR),
    robot('rover-mini', null),
    robot('rover-yard', OLD, {}, 'map-yard'),
    robot('rover-elsewhere', OLD, { site_id: 'site-other' }),
  ]
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Robot maps', () => {
  it("sums up this site's robots in one line, then rows with a dot and a word", () => {
    render()
    expect(text()).toContain('로봇 지도')
    // 4 at this site (rover-elsewhere is not): 1 same, 1 differs, 1 other map, 1 unknown.
    expect(summary()).toBe('이 현장의 로봇 4대 · 1대는 이 버전 · 1대는 다른 버전 · 1대는 다른 지도 · 1대는 버전 모름')
    expect(row('rover-jetson')!.dataset.match).toBe('differs')
    expect(row('rover-jetson')!.textContent).toContain('다름')
    expect(row('rover-pi')!.textContent).toContain('같음')
    expect(row('rover-mini')!.textContent).toContain('모름')
    expect(row('rover-elsewhere')).toBeNull()
  })

  it('in English, with plurals', async () => {
    await i18n.changeLanguage('en')
    try {
      robots.current = [robot('rover-pi', FLOOR), robot('rover-none', null, {}, null as unknown as string)]
      render()
      expect(summary()).toBe('2 robots at this site · 1 has this version · 1 has no map')
    } finally {
      await i18n.changeLanguage('ko')
    }
  })

  it('shows at most three rows, and "Show all N" opens the rest and closes them again', () => {
    render()
    expect(rows()).toEqual(['rover-jetson', 'rover-pi', 'rover-mini'])
    const more = host.querySelector<HTMLButtonElement>('[data-show-all]')!
    expect(more.textContent).toBe('4대 모두 보기')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    click(more)
    expect(rows()).toEqual(['rover-jetson', 'rover-pi', 'rover-mini', 'rover-yard'])
    expect(row('rover-yard')!.textContent).toContain('다른 지도')
    expect(row('rover-yard')!.textContent).toContain('Yard')
    click(host.querySelector('[data-show-all]')!)
    expect(rows()).toHaveLength(3)
  })

  it('has no "Show all" for three robots or fewer', () => {
    robots.current = robots.current.slice(0, 3)
    render()
    expect(host.querySelector('[data-show-all]')).toBeNull()
  })

  it("has no Send or Use buttons in the rows any more: they are the chooser's", () => {
    robots.current = [robot('rover-jetson', OLD, { bridge: { ...robot('x', OLD).bridge!, schema_version: '0.0.29' } })]
    render()
    expect(button(row('rover-jetson'), '로봇에 보내기')).toBeUndefined()
    expect(button(row('rover-jetson'), '이 지도 사용')).toBeUndefined()
  })

  it.each([
    ['walking', { nav_goal: { goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: null, map_id: 'map-office', state: 'active', reason: null, updated_at: '' } }, '로봇이 목표 지점으로 걷는 중입니다.'],
    ['on a mission', { abstract_state: 'AUTO_MISSION' }, '로봇이 미션 중입니다.'],
    ['offline', { connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } }, '로봇이 오프라인입니다.'],
  ] as const)('keeps the info button with the reason while the robot is %s', (_, over, reason) => {
    robots.current = [robot('rover-jetson', OLD, over as Partial<RobotState>)]
    render()
    expect(why('rover-jetson')).toBe(reason)
  })

  it('names the bridge a switch needs for a robot on another map', () => {
    robots.current = [robot('rover-yard', OLD, {}, 'map-yard')]  // a 0.0.26 bridge
    render()
    expect(why('rover-yard')).toContain('0.0.29')
    expect(row('rover-yard')!.querySelector('[data-why]')!.getAttribute('data-use-block')).toBe('oldBridge')
  })

  it('without configure, the reason is the role it needs, and only where something would be put', () => {
    perms.configure = false
    render()
    expect(why('rover-jetson')).toContain('엔지니어 역할이 필요합니다')
    expect(why('rover-pi')).toBe('')
  })

  it('lists a robot with no map too, and says when the site has no robot', () => {
    robots.current = [robot('rover-none', null, {}, null as unknown as string)]
    render()
    expect(row('rover-none')!.dataset.match).toBe('noMap')
    expect(row('rover-none')!.textContent).toContain('지도 없음')
    robots.current = []
    render()
    expect(text()).toContain('이 현장에는 아직 로봇이 없습니다.')
    expect(host.querySelector('[data-robot-summary]')).toBeNull()
  })

  it('is a row of dot, name and status badge, with the explanation on hover', () => {
    render()
    const r = row('rover-jetson')!
    const badge = [...r.querySelectorAll<HTMLElement>('.rh-badge')].find((b) => b.textContent === '다름')!
    expect(badge.getAttribute('title')).toContain('다른 버전')
    // No paragraph under a row until its info button is pressed.
    expect(r.querySelector('p')).toBeNull()
  })

  it('the info button shows the reason in the row, for touch screens with no hover', () => {
    robots.current = [robot('rover-jetson', OLD, { abstract_state: 'AUTO_MISSION' })]
    render()
    expect(row('rover-jetson')!.querySelector('[data-why-text]')).toBeNull()
    click(row('rover-jetson')!.querySelector('[data-why]')!)
    expect(row('rover-jetson')!.querySelector('[data-why-text]')!.textContent).toBe('로봇이 미션 중입니다.')
  })

  it('says whether a robot on this version is placed on it, and offers Set position when not', () => {
    const placed = robot('rover-pi', FLOOR, { position: { ...initialRobots[1].position, provider: 'slam', quality: 'localized' } })
    const unplaced = robot('rover-mini', FLOOR, { position: { ...initialRobots[1].position, provider: 'dead_reckoning', quality: 'estimated' } })
    robots.current = [placed, unplaced, robot('rover-jetson', OLD)]
    render()
    expect(row('rover-pi')!.querySelector('[data-placed]')!.getAttribute('data-placed')).toBe('true')
    expect(row('rover-mini')!.querySelector('[data-placed]')!.getAttribute('data-placed')).toBe('false')
    expect(row('rover-jetson')!.querySelector('[data-placed]')).toBeNull()
    expect(button(row('rover-pi'), '위치 지정')).toBeUndefined()
    click(button(row('rover-mini'), '위치 지정'))
    expect(window.location.hash).toBe('#/site/site-dev/liveops')
    window.history.replaceState(null, '', '#/')
  })

  it('draws no hairline borders', () => {
    render()
    click(host.querySelector('[data-show-all]')!)
    expect(host.innerHTML).not.toMatch(/border(-left)?:\s*1(\.5)?px solid/)
  })
})

// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { robots, perms, send, use } = vi.hoisted(() => ({
  robots: { current: [] as unknown[] },
  perms: { configure: true },
  send: vi.fn(),
  use: vi.fn(),
}))
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (select: (s: { robots: unknown[] }) => unknown) => select({ robots: robots.current }),
}))
vi.mock('@/org/useCan', () => ({ useCan: (id: string) => (id === 'configure' ? perms.configure : true) }))
vi.mock('./robotMaps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./robotMaps')>()),
  sendMapToRobot: send,
  sendUseNavMap: use,
}))

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
const button = (scope: Element | null, name: string) =>
  [...(scope ?? host).querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click() })
const settle = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve() })
// StrictMode, as the app runs: its double mount once left a sent row saying "Sending…" forever.
const render = () => act(() => root.render(<StrictMode><MapRobotsSection map={map} floorIndex={0} maps={[map, yard]} /></StrictMode>))

beforeAll(async () => { await i18n.changeLanguage('ko') })
beforeEach(() => {
  perms.configure = true
  send.mockReset()
  use.mockReset()
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
  it("lists this site's robots for the map with a dot and a word", () => {
    render()
    expect(text()).toContain('로봇 지도')
    expect(row('rover-jetson')!.dataset.match).toBe('differs')
    expect(row('rover-jetson')!.textContent).toContain('다름')
    expect(row('rover-pi')!.textContent).toContain('같음')
    expect(row('rover-mini')!.textContent).toContain('모름')
    expect(row('rover-yard')!.textContent).toContain('다른 지도')
    expect(row('rover-yard')!.textContent).toContain('Yard')
    expect(row('rover-elsewhere')).toBeNull()
  })

  it('offers Send to robot only for a robot that differs, and only with configure', () => {
    render()
    expect(button(row('rover-jetson'), '로봇에 보내기')).toBeTruthy()
    expect(button(row('rover-pi'), '로봇에 보내기')).toBeUndefined()
    expect(button(row('rover-mini'), '로봇에 보내기')).toBeUndefined()
    expect(button(row('rover-yard'), '로봇에 보내기')).toBeUndefined()
    perms.configure = false
    render()
    expect(button(row('rover-jetson'), '로봇에 보내기')).toBeUndefined()
    // ... and says why, rather than hiding it without a word.
    expect(row('rover-jetson')?.textContent).toContain('엔지니어 역할이 필요합니다')
    expect(row('rover-pi')?.textContent).not.toContain('엔지니어')
  })

  it('asks in place, then sends this floor and says it was sent, and to set the position again', async () => {
    let resolve: (v: unknown) => void = () => {}
    send.mockReturnValue(new Promise((r) => { resolve = r }))
    render()
    click(button(row('rover-jetson'), '로봇에 보내기'))
    expect(row('rover-jetson')!.textContent).toContain('rover-jetson의 지도를 이 버전으로 바꿉니다. 걷는 중이면 할 수 없습니다.')
    click(button(row('rover-jetson'), '보내기'))
    expect(send).toHaveBeenCalledWith('rover-jetson', { map_id: 'map-office', floor_index: 0, map_hash: FLOOR })
    expect(row('rover-jetson')!.textContent).toContain('보내는 중')
    await act(async () => {
      resolve({ result: 'completed', command: { result: { map_hash: FLOOR, changed: ['localisation', 'planning'], relocalise: true } } })
    })
    await settle()
    expect(row('rover-jetson')!.textContent).toContain('보냈습니다')
    expect(row('rover-jetson')!.textContent).toContain('위치를 다시 잡아 주세요')
    // Not offered again while the new hash is on its way back.
    expect(button(row('rover-jetson'), '로봇에 보내기')).toBeUndefined()
  })

  it('cancels without sending', () => {
    render()
    click(button(row('rover-jetson'), '로봇에 보내기'))
    click(button(row('rover-jetson'), '취소'))
    expect(send).not.toHaveBeenCalled()
    expect(button(row('rover-jetson'), '로봇에 보내기')).toBeTruthy()
  })

  it("shows the robot's reason when it refuses", async () => {
    send.mockResolvedValue({ result: 'failed', command: {
      current_stage: 'execution_failed', failure_reason: 'REJECTED_NAV_GOAL_ACTIVE: a goal is active',
    } })
    render()
    click(button(row('rover-jetson'), '로봇에 보내기'))
    click(button(row('rover-jetson'), '보내기'))
    await settle()
    expect(row('rover-jetson')!.textContent).toContain('보내지 못했습니다')
    expect(row('rover-jetson')!.textContent).toContain(i18n.t('command.refusal.code.REJECTED_NAV_GOAL_ACTIVE'))
    // And may try again.
    expect(button(row('rover-jetson'), '로봇에 보내기')).toBeTruthy()
  })

  it.each([
    ['walking', { nav_goal: { goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: null, map_id: 'map-office', state: 'active', reason: null, updated_at: '' } }, '로봇이 목표 지점으로 걷는 중입니다.'],
    ['on a mission', { abstract_state: 'AUTO_MISSION' }, '로봇이 미션 중입니다.'],
    ['offline', { connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } }, '로봇이 오프라인입니다.'],
  ] as const)('is off with the reason while the robot is %s', (_, over, reason) => {
    robots.current = [robot('rover-jetson', OLD, over as Partial<RobotState>)]
    render()
    const b = button(row('rover-jetson'), '로봇에 보내기')!
    expect(b.disabled).toBe(true)
    expect(row('rover-jetson')!.textContent).toContain(reason)
  })

  it('lists a robot with no map too, and says when the site has no robot', () => {
    robots.current = [robot('rover-none', null, {}, null as unknown as string)]
    render()
    expect(row('rover-none')!.dataset.match).toBe('noMap')
    expect(row('rover-none')!.textContent).toContain('지도 없음')
    robots.current = []
    render()
    expect(text()).toContain('이 현장에는 아직 로봇이 없습니다.')
  })

  describe('Use this map (0.0.29)', () => {
    const on = (schema: string, over: Partial<RobotState> = {}, navMap: string | null = 'map-yard') => {
      const r = robot('rover-yard', OLD, over, navMap as string)
      return { ...r, bridge: { ...r.bridge!, schema_version: schema, nav_map_hash: navMap ? OLD : null } } as RobotState
    }

    it('is shown for a robot on another map with configure and a 0.0.29 bridge, hidden on 0.0.28 with the reason', () => {
      robots.current = [on('0.0.29')]
      render()
      expect(button(row('rover-yard'), '이 지도 사용')).toBeTruthy()
      robots.current = [on('0.0.28')]
      render()
      expect(button(row('rover-yard'), '이 지도 사용')).toBeUndefined()
      expect(row('rover-yard')!.textContent).toContain('0.0.29')
    })

    it('is shown for a robot with no map at all', () => {
      robots.current = [on('0.0.29', {}, null)]
      render()
      expect(button(row('rover-yard'), '이 지도 사용')).toBeTruthy()
    })

    it('is not offered for a robot on this map', () => {
      robots.current = [robot('rover-jetson', OLD, { bridge: { ...robot('x', OLD).bridge!, schema_version: '0.0.29' } })]
      render()
      expect(button(row('rover-jetson'), '이 지도 사용')).toBeUndefined()
      expect(button(row('rover-jetson'), '로봇에 보내기')).toBeTruthy()
    })

    it.each([
      ['offline', { connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } }, '로봇이 오프라인입니다.'],
      ['in E-Stop', { abstract_state: 'E_STOP' }, '로봇이 비상 정지 상태입니다.'],
      ['on a mission', { abstract_state: 'AUTO_MISSION' }, '로봇이 미션 중입니다.'],
      ['walking', { nav_goal: { goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: null, map_id: 'map-yard', state: 'active', reason: null, updated_at: '' } }, '로봇이 목표 지점으로 걷는 중입니다.'],
    ] as const)('is not offered while the robot is %s, and says why', (_, over, reason) => {
      robots.current = [on('0.0.29', over as Partial<RobotState>)]
      render()
      expect(button(row('rover-yard'), '이 지도 사용')).toBeUndefined()
      expect(row('rover-yard')!.textContent).toContain(reason)
    })

    it('without configure: no button, and the role it needs', () => {
      perms.configure = false
      robots.current = [on('0.0.29')]
      render()
      expect(button(row('rover-yard'), '이 지도 사용')).toBeUndefined()
      expect(row('rover-yard')!.textContent).toContain('엔지니어 역할이 필요합니다')
    })

    it('closes an open question when the robot becomes blocked, or configure is lost', () => {
      robots.current = [on('0.0.29')]
      render()
      click(button(row('rover-yard'), '이 지도 사용'))
      expect(row('rover-yard')!.querySelector('[role="alert"]')).not.toBeNull()
      robots.current = [on('0.0.29', { abstract_state: 'E_STOP' })]
      render()
      expect(row('rover-yard')!.querySelector('[role="alert"]')).toBeNull()
      expect(row('rover-yard')!.textContent).toContain('로봇이 비상 정지 상태입니다.')

      robots.current = [on('0.0.29')]
      render()
      click(button(row('rover-yard'), '이 지도 사용'))
      perms.configure = false
      render()
      expect(row('rover-yard')!.querySelector('[role="alert"]')).toBeNull()
      expect(use).not.toHaveBeenCalled()
    })

    it('closes an open Send question when the robot goes offline', () => {
      robots.current = [robot('rover-jetson', OLD)]
      render()
      click(button(row('rover-jetson'), '로봇에 보내기'))
      expect(row('rover-jetson')!.querySelector('[role="alert"]')).not.toBeNull()
      robots.current = [robot('rover-jetson', OLD, { connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } })]
      render()
      expect(row('rover-jetson')!.querySelector('[role="alert"]')).toBeNull()
      expect(send).not.toHaveBeenCalled()
    })

    it('says navigation restarts and the robot must stand still, sends USE_NAV_MAP, then offers Set position', async () => {
      use.mockResolvedValue({ result: 'completed', command: { result: { map_hash: FLOOR, relocalise: true } } })
      robots.current = [on('0.0.29')]
      render()
      click(button(row('rover-yard'), '이 지도 사용'))
      const confirm = row('rover-yard')!.textContent!
      expect(confirm).toContain('내비게이션이 다시 시작')
      expect(confirm).toContain('가만히 서 있어야')
      expect(confirm).toContain('위치 지정')
      click(button(row('rover-yard')!.querySelector('[role="alert"]'), '이 지도 사용'))
      expect(use).toHaveBeenCalledWith('rover-yard', { map_id: 'map-office', floor_index: 0, map_hash: FLOOR })
      expect(send).not.toHaveBeenCalled()
      await settle()
      expect(row('rover-yard')!.textContent).toContain('로봇이 이제 이 지도를 사용합니다.')
      expect(button(row('rover-yard'), '위치 지정')).toBeTruthy()
    })
  })

  it('draws no hairline borders', () => {
    render()
    click(button(row('rover-jetson'), '로봇에 보내기'))
    expect(host.innerHTML).not.toMatch(/border(-left)?:\s*1(\.5)?px solid/)
  })
})

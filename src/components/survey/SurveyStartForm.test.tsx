// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { mockMaps } from '@/mocks/maps'
import { initialRobots } from '@/mocks/mockRobots'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { SurveyStartForm, surveyFloor } from './SurveyStartForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SITE = 'site-north-yard'
const jetson: RobotState = {
  ...initialRobots[0], robot_id: 'rover-jetson', name: 'rover-jetson', site_id: SITE, abstract_state: 'STAND', control_owner: null,
  active_run: null, nav_goal: null, connectivity: { ...initialRobots[0].connectivity, bridge_state: 'connected' },
}
/** An office map with a ground floor and a named first floor. */
const office: SiteMap = {
  ...mockMaps[0], map_id: 'map-office', name: 'Office',
  floors: [{ ...mockMaps[0].floors[0], index: 1, label: '2F' }, { ...mockMaps[0].floors[0], index: 0, label: null }],
}

let host: HTMLDivElement
let root: Root
let dispatch: ReturnType<typeof vi.fn>
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const select = (label: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
const choose = (el: HTMLSelectElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
})
const type = (el: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const sent = () => dispatch.mock.calls.find((c) => c[1] === 'START_SURVEY')?.[3] as Record<string, unknown> | undefined

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(async () => {
  useSessionStore.setState({ role: 'engineer' })
  vi.spyOn(dataProvider, 'listMaps').mockResolvedValue([office])
  dispatch = vi.fn(async (_r: string, type: string, _l: string, params?: Record<string, unknown>): Promise<CommandOutcome> => ({
    result: 'completed', command: { command_id: 'c1', robot_id: 'rover-jetson', type, label: '', params, stages: [], current_stage: 'execution_completed', initiated_by: 'x' } as never,
  }))
  useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<SurveyStartForm siteId={SITE} robots={[jetson]} robotId="rover-jetson" onStarted={() => {}} />))
  await settle()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('the survey form: floors (map ready 4.1)', () => {
  it('new map: no floor number, the floor name is sent, index 0', async () => {
    expect(host.querySelector('input[type="number"]')).toBeNull()
    expect(select('Floor')).toBeNull()
    await type(host.querySelector<HTMLInputElement>('input[name="floor-label"]')!, '  1F ')
    await act(async () => { button('Start survey')!.click() })
    await settle()
    expect(sent()).toMatchObject({ map_id: null, floor_index: 0, floor_label: '1F' })
  })

  it('new map with no floor name sends none', async () => {
    await act(async () => { button('Start survey')!.click() })
    await settle()
    expect(sent()).toMatchObject({ map_id: null, floor_index: 0 })
    expect(sent()).not.toHaveProperty('floor_label')
  })

  it('existing map offers its floors and the next one only', async () => {
    await choose(select('Map')!, 'map-office')
    const options = [...select('Floor')!.options].map((o) => [o.value, o.textContent])
    expect(options).toEqual([['0', 'Floor 0'], ['1', '2F (floor 1)'], ['next', 'Add the next floor (floor 2)']])
    // A floor it has: replaced, and its name is its own.
    expect(host.querySelector('input[name="floor-label"]')).toBeNull()
    await choose(select('Floor')!, '1')
    await act(async () => { button('Start survey')!.click() })
    await settle()
    expect(sent()).toMatchObject({ map_id: 'map-office', floor_index: 1 })
    expect(sent()).not.toHaveProperty('floor_label')
  })

  it('the next floor is index = number of floors, with an optional name', async () => {
    await choose(select('Map')!, 'map-office')
    await choose(select('Floor')!, 'next')
    await type(host.querySelector<HTMLInputElement>('input[name="floor-label"]')!, '3F')
    await act(async () => { button('Start survey')!.click() })
    await settle()
    expect(sent()).toMatchObject({ map_id: 'map-office', floor_index: 2, floor_label: '3F' })
  })

  it('reads in Korean', async () => {
    await act(async () => { await i18n.changeLanguage('ko') })
    try {
      await choose(select('지도')!, 'map-office')
      expect([...select('층')!.options].map((o) => o.textContent)).toEqual(['0층', '2F (1층)', '다음 층 추가 (2층)'])
    } finally {
      await act(async () => { await i18n.changeLanguage('en') })
    }
  })
})

describe('surveyFloor', () => {
  it('a new map is the ground floor; an existing one is a floor it has or the next', () => {
    expect(surveyFloor(null, '7', ' G ')).toEqual({ floor_index: 0, floor_label: 'G' })
    expect(surveyFloor(null, '0', '')).toEqual({ floor_index: 0, floor_label: null })
    expect(surveyFloor(office, '1', 'ignored')).toEqual({ floor_index: 1, floor_label: null })
    expect(surveyFloor(office, 'next', '')).toEqual({ floor_index: 2, floor_label: null })
  })
})

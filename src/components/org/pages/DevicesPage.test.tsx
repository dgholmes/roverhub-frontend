// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

/** Org › Devices: the edge device's address column, beside the robot's own. */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const relay = vi.hoisted(() => ({
  baseUrl: undefined as string | undefined,
  perRobot: {} as Record<string, string>,
}))
vi.mock('@/lib/edgeVideo', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/edgeVideo')>()
  return {
    ...actual,
    edgeVideoFor: (robotId: string, advertised?: string | null) =>
      actual.edgeVideoFor(robotId, advertised, { perRobot: relay.perRobot, global: relay.baseUrl }),
  }
})
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { setDeviceAcceptance: vi.fn() } }))
vi.mock('@/mocks/mockDataProvider', () => ({ mockDataProvider: { addRobot: vi.fn() } }))
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: create(() => ({ robots: [] as RobotState[] })),
}))
vi.mock('./MoveRobotSite', () => ({ MoveSiteAction: () => null }))
vi.mock('@/org/navigation', () => ({ openRobot: vi.fn() }))

import { DevicesPage } from './DevicesPage'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'

const withBridge = {
  ...initialRobots[0], robot_id: 'rover-jetson', name: 'Jetson',
  bridge: { ...initialRobots[0].bridge!, acceptance: 'accepted', video_base_url: 'http://10.0.12.116:8090' },
} as RobotState
const noBridge = { ...initialRobots[1], robot_id: 'rover-new', name: 'New', bridge: undefined } as RobotState

let host: HTMLDivElement
let root: Root
const headers = () => [...host.querySelectorAll('thead th')].map((th) => th.textContent)
/** The cell under a header, in the row for `robotId`. */
const cell = (robotId: string, header: string) => {
  const col = headers().indexOf(header)
  const row = [...host.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(robotId))
  return row?.querySelectorAll('td')[col] as HTMLElement | undefined
}
const render = () => act(() => root.render(<DevicesPage />))

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  relay.baseUrl = undefined
  relay.perRobot = {}
  useLiveOpsStore.setState({ robots: [withBridge, noBridge] } as never)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  act(() => root.unmount())
  host.remove()
  await i18n.changeLanguage('en')
})

describe('Org › Devices › device address', () => {
  it('sits between the edge device and its contract, apart from the robot address', () => {
    render()
    const h = headers()
    expect(h.indexOf('Device address')).toBe(h.indexOf('Edge device') + 1)
    expect(h.indexOf('Contract')).toBe(h.indexOf('Device address') + 1)
    expect(h).toContain('Robot address')
  })

  it('shows the address and its source for a robot with a bridge, a dash for one without', () => {
    render()
    const c = cell('rover-jetson', 'Device address')!
    expect(c.textContent).toContain('http://10.0.12.116:8090')
    expect(c.querySelector('.rh-badge')?.textContent).toBe('Reported by the device')
    expect(cell('rover-new', 'Device address')?.textContent).toBe('—')
  })

  it('names the console when its override wins', () => {
    relay.perRobot = { 'rover-jetson': 'http://10.0.12.200:8090' }
    render()
    const c = cell('rover-jetson', 'Device address')!
    expect(c.textContent).toContain('http://10.0.12.200:8090')
    expect(c.textContent).not.toContain('10.0.12.116')
    expect(c.querySelector('.rh-badge')?.textContent).toBe('Set in this console')
  })

  it('shows a console address even for a robot that has not registered', () => {
    relay.perRobot = { 'rover-new': 'http://10.0.12.50:8090' }
    render()
    const c = cell('rover-new', 'Device address')!
    expect(c.textContent).toContain('http://10.0.12.50:8090')
    expect(c.querySelector('.rh-badge')?.textContent).toBe('Set in this console')
  })

  it('says the device reports none rather than a blank', () => {
    useLiveOpsStore.setState({ robots: [{ ...withBridge, bridge: { ...withBridge.bridge!, video_base_url: null } }] } as never)
    render()
    expect(cell('rover-jetson', 'Device address')?.textContent).toBe('The device does not report one')
  })

  it('says it in Korean', async () => {
    await act(async () => { await i18n.changeLanguage('ko') })
    render()
    expect(headers()).toContain('장치 주소')
    expect(cell('rover-jetson', '장치 주소')?.querySelector('.rh-badge')?.textContent).toBe('장치가 보고함')
  })
})

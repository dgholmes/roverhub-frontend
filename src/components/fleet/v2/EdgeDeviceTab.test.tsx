// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

/** Fleet › a robot › Edge device: the address the console fetches video from,
 * where it came from, and when the device last reported. */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The console's own .env, per test. The url the bridge advertises still goes
// through the real precedence.
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
// An operator, not an engineer: the rows must not live in the engineers' block.
vi.mock('@/org/useCan', () => ({ useCan: () => false }))

import { EdgeDeviceTab } from './EdgeDeviceTab'

const robot = (video_base_url: string | null | undefined, over: Partial<RobotState> = {}) => ({
  ...initialRobots[1], robot_id: 'rover-pi', name: 'rover-pi',
  bridge: { ...initialRobots[1].bridge!, video_base_url, last_heartbeat_at: new Date(Date.now() - 4000).toISOString() },
  ...over,
}) as RobotState

let host: HTMLDivElement
let root: Root
const render = (r: RobotState) => act(() => root.render(<EdgeDeviceTab robot={r} />))
const section = (title: string) => [...host.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === title)
/** The <dd> for a label in a section's KeyValue. */
const value = (s: Element | undefined, label: string) =>
  [...(s?.querySelectorAll('dt') ?? [])].find((dt) => dt.textContent === label)?.nextElementSibling as HTMLElement | undefined
const device = () => section(i18n.t('fleetDetail.edge.device'))

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  relay.baseUrl = undefined
  relay.perRobot = {}
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  act(() => root.unmount())
  host.remove()
  await i18n.changeLanguage('en')
})

describe('Fleet › Edge device › address', () => {
  it('shows the advertised address and names the device as its source', () => {
    render(robot('http://10.0.12.101:8090'))
    expect(value(device(), 'Video address')?.textContent).toBe('http://10.0.12.101:8090')
    const source = value(device(), 'Address from')
    expect(source?.textContent).toBe('Reported by the device')
    expect(source?.querySelector('.rh-badge')).not.toBeNull()
    expect(value(device(), 'Last reported')?.textContent).toBe(i18n.t('misc.ageSeconds', { n: 4 }))
  })

  it('names the console override when one is set, not the device', () => {
    relay.perRobot = { 'rover-pi': 'http://10.0.12.4:8090' }
    render(robot('http://10.0.12.101:8090'))
    expect(value(device(), 'Video address')?.textContent).toBe('http://10.0.12.4:8090')
    expect(value(device(), 'Address from')?.textContent).toBe('Set in this console')
  })

  it('names the console for its single global address too', () => {
    relay.baseUrl = 'http://10.0.12.9:8090'
    render(robot(null))
    expect(value(device(), 'Video address')?.textContent).toBe('http://10.0.12.9:8090')
    expect(value(device(), 'Address from')?.textContent).toBe('Set in this console')
  })

  it('says the device reports no address rather than showing a blank', () => {
    render(robot(null))
    expect(value(device(), 'Video address')?.textContent).toBe('None: this console does not set one either')
    expect(value(device(), 'Address from')?.textContent).toBe('The device does not report one')
  })

  it('renders a robot that has never registered', () => {
    expect(() => render(robot(undefined, { bridge: undefined }))).not.toThrow()
    expect(host.textContent).toContain(i18n.t('fleetDetail.edge.notCheckedInTitle'))
  })

  it('says it in Korean', async () => {
    await act(async () => { await i18n.changeLanguage('ko') })
    render(robot('http://10.0.12.101:8090'))
    const d = section('장치')
    expect(value(d, '영상 주소')?.textContent).toBe('http://10.0.12.101:8090')
    expect(value(d, '주소 출처')?.textContent).toBe('장치가 보고함')
    expect(value(d, '마지막 보고')).toBeDefined()
  })
})

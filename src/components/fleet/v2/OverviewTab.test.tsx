// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { PENDING_FROM_DOBOT } from '@/fleet/pendingFromDobot'
import type { RobotState } from '@/types'

/** Fleet › a robot › Overview. What the Service tab listed -- the tools the
 * robot's own app has and its SDK does not -- is folded into Hardware, and AI
 * detection lives on the Sensors tab (Systems into Fleet, task 4). */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider } = vi.hoisted(() => ({
  provider: {
    getPerceptionStatus: vi.fn(() => undefined),
    subscribePerceptionStatus: vi.fn(() => () => {}),
    listMaps: vi.fn(async () => []),
  },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
// The real store would build the data provider's robot list on import.
vi.mock('@/store/useLiveOpsStore', () => {
  const state = { dispatchCommand: () => {} } as Record<string, unknown>
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(state)
  useLiveOpsStore.getState = () => state
  return { useLiveOpsStore }
})

import { OverviewTab } from './OverviewTab'

const robot = {
  ...initialRobots[1], robot_id: 'rover-jetson', name: 'rover-jetson', site_id: 'site-dev',
  bridge: { ...initialRobots[1].bridge!, schema_version: '0.0.31' },
} as RobotState

let host: HTMLDivElement
let root: Root

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<OverviewTab robot={robot} />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const headings = () => [...host.querySelectorAll('h3')].map((h) => h.textContent)
const section = (title: string) => [...host.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === title)

describe('Fleet › Overview', () => {
  it('lists what waits on Dobot', () => {
    const hardware = section(i18n.t('fleet.overview.hardware'))!
    const details = hardware.querySelector('details')!
    expect(details).not.toBeNull()
    // Folded until asked for: none of it can be done today.
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('Waiting on Dobot (6)')
    const items = [...details.querySelectorAll('li')]
    const keys = ['calibration', 'firmware_update', 'joint_limits', 'traffic', 'led_health', 'voice_health'] as const
    expect(items).toHaveLength(keys.length)
    keys.forEach((key, i) => {
      expect(items[i].textContent).toContain(PENDING_FROM_DOBOT[key].label)
      expect(items[i].textContent).toContain(i18n.t(`fleetDetail.service.${key}`))
      // Each with its question to Dobot.
      expect(items[i].textContent).toContain(i18n.t('misc.askingDobot', { n: PENDING_FROM_DOBOT[key].question }))
    })
    // Foot type, with its own question.
    expect(hardware.textContent).toContain(i18n.t('fleetDetail.service.footType'))
    expect(hardware.textContent).toContain(i18n.t('fleetDetail.service.footTypeNote'))
    expect(hardware.textContent).toContain(i18n.t('misc.askingDobot', { n: PENDING_FROM_DOBOT.foot_type.question }))
  })

  it('says it in Korean', async () => {
    await act(async () => { await i18n.changeLanguage('ko') })
    try {
      const summary = section(i18n.t('fleet.overview.hardware'))!.querySelector('details summary')
      expect(summary?.textContent).toBe(i18n.t('fleetDetail.service.waitingCount', { count: 6 }))
      expect(summary?.textContent).toContain('6')
      expect(summary?.textContent).not.toBe('Waiting on Dobot (6)')
    } finally {
      await act(async () => { await i18n.changeLanguage('en') })
    }
  })

  it('has no AI detection', () => {
    expect(headings()).not.toContain(i18n.t('command.detection.title'))
    expect(host.querySelector('[role="switch"]')).toBeNull()
  })
})

describe('Fleet › Overview › Greeter (0.0.36)', () => {
  const row = () => host.querySelector('[data-greeter-row]')

  it('says to update a robot whose bridge reports no greeter', () => {
    expect(row()?.textContent).toContain('Update the robot to use this')
    expect(row()?.querySelector('.rh-badge')).toBeNull()
  })

  it('shows the status chip, the reason when blocked, the last greeting and today\'s count', () => {
    const greeted = new Date()
    greeted.setHours(10, 32, 0, 0)
    act(() => root.render(<OverviewTab robot={{
      ...robot,
      greeter: {
        enabled: true, phase: 'blocked', blocked_reason: 'lying_down',
        last_greeted_at: greeted.toISOString(), greetings_today: 7, setting: null,
      },
    }} />))
    const text = row()!.textContent!
    expect(row()!.querySelector('.rh-badge')?.textContent).toBe('Blocked')
    expect(text).toContain('the robot is lying down')
    expect(text).toContain('Last greeted')
    expect(text).toMatch(/10:32/)
    expect(text).toContain('Greetings today: 7')
    // The row sits in Status, labelled as the robot's other settings are.
    expect(section(i18n.t('fleet.overview.status'))!.textContent).toContain('Greeter')
  })

  it('says Watching and "Not yet" for a robot that has not greeted', () => {
    act(() => root.render(<OverviewTab robot={{
      ...robot,
      greeter: { enabled: true, phase: 'watching', blocked_reason: null, last_greeted_at: null, greetings_today: 0, setting: null },
    }} />))
    expect(row()!.querySelector('.rh-badge')?.textContent).toBe('Watching')
    expect(row()!.textContent).toContain('Not yet')
    expect(row()!.querySelector('[data-greeter-reason]')).toBeNull()
  })
})

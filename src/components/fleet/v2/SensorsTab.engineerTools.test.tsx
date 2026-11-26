// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { RobotState } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_USER, type AuthUser } from '@/lib/auth/types'
import { useSessionStore } from '@/store/useSessionStore'

/** Fleet › Sensors with the real `useCan`: an owner who is a supervisor on
 * every site gets Apply measured and Edit values once engineer tools are on.
 * The tab's own behaviour is SensorsTab.test.tsx's job. */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider } = vi.hoisted(() => ({
  provider: { subscribeLidarMount: vi.fn() },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/sensors/sensorCommands', () => ({ setLidarMount: vi.fn(), setCalibrationMode: vi.fn(), calibrationTurn: vi.fn(), takeControl: vi.fn() }))

import { SensorsTab } from './SensorsTab'
import { initialRobots } from '@/mocks/mockRobots'

// The offset differs from what is in use, so step 2 offers Apply measured.
const inUse = { x_m: 0.2, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 5.9, yaw_deg: 0 }
const status: LidarMountStatus = {
  robot_id: 'rover-jetson', site_id: 'site-dev', mode: 'suggest', in_use: inUse,
  measured: {
    x_m: 0.251, y_m: 0.012, sd_x_m: 0.008, sd_y_m: 0.006, roll_deg: 0.2, pitch_deg: 12.4, sd_tilt_deg: 0.3,
    turns: 184, still_samples: 5120, since: '2026-11-14T00:00:00Z', updated_at: new Date().toISOString(),
  },
  differs: true,
  history: [],
  updated_at: new Date().toISOString(),
}

const robot = {
  ...initialRobots[1], robot_id: 'rover-jetson', name: 'rover-jetson', site_id: 'site-dev',
  bridge: { ...initialRobots[1].bridge!, schema_version: '0.0.23' },
} as RobotState

const owner: AuthUser = {
  user_id: 'u-own', username: 'owner', display_name: 'Owner', org_role: 'owner',
  site_roles: { '*': 'supervisor' }, audit_access: true, disabled: false,
  engineer_tools: false, can_use_engineer_tools: true,
}

let host: HTMLDivElement
let root: Root
let listener: ((s: LidarMountStatus) => void) | null

const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name)
function show(user: AuthUser) {
  useAuthStore.setState({ status: 'signedIn', authEnabled: true, user, token: 't', expiresAt: null, notice: null })
  act(() => root.render(<SensorsTab robot={robot} />))
  act(() => listener?.(status))
}

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  listener = null
  provider.subscribeLidarMount.mockReset().mockImplementation((l: (s: LidarMountStatus) => void) => {
    listener = l
    return () => { if (listener === l) listener = null }
  })
  useSessionStore.setState({ activeSiteId: 'site-dev' })
  try { localStorage.clear() } catch { /* none */ }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
})

describe('Fleet › Sensors with engineer tools', () => {
  it('is read-only for a supervisor with the switch off', () => {
    show(owner)
    expect(button('Apply measured')).toBeUndefined()
    expect(button('Edit values')).toBeUndefined()
  })

  it('offers Apply measured and Edit values to a supervisor with the switch on', () => {
    show({ ...owner, engineer_tools: true })
    expect(button('Apply measured')).toBeDefined()
    expect(button('Edit values')).toBeDefined()
  })

  it('opens nothing at a site the user has no role at', () => {
    show({ ...owner, site_roles: { 'site-other': 'supervisor' }, engineer_tools: true })
    expect(button('Apply measured')).toBeUndefined()
    expect(button('Edit values')).toBeUndefined()
  })
})

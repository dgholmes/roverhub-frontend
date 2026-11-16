// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { RobotState } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider, robots, perms, commands } = vi.hoisted(() => ({
  provider: { subscribeLidarMount: vi.fn() },
  robots: { current: [] as unknown[] },
  perms: { configure: true },
  commands: { setLidarMount: vi.fn(), setCalibrationMode: vi.fn() },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => robots.current }))
vi.mock('@/org/useCan', () => ({ useCan: (id: string) => (id === 'configure' ? perms.configure : true) }))
vi.mock('@/sensors/sensorCommands', () => commands)

import { SensorsPage } from './SensorsPage'

const robot = (robot_id: string, schema: string | null, bridge: 'connected' | 'offline' = 'connected') =>
  ({ robot_id, name: robot_id, site_id: 'site-dev', connectivity: { bridge_state: bridge }, bridge: { schema_version: schema } }) as unknown as RobotState

const inUse = { x_m: 0.234, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 5.9, yaw_deg: 0 }
const status = (over: Partial<LidarMountStatus> = {}): LidarMountStatus => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', mode: 'suggest', in_use: inUse,
  measured: {
    x_m: 0.251, y_m: 0.012, sd_x_m: 0.008, sd_y_m: 0.006, roll_deg: 0.2, pitch_deg: 12.4, sd_tilt_deg: 0.3,
    turns: 184, still_samples: 5120, since: '2026-11-14T00:00:00Z', updated_at: new Date().toISOString(),
  },
  differs: true,
  history: [
    { at: '2026-11-13T00:00:00Z', mount: inUse, source: 'manual', by: 'eng-1' },
    { at: '2026-11-10T00:00:00Z', mount: { ...inUse, x_m: 0, pitch_deg: 0 }, source: 'default', by: null },
  ],
  updated_at: new Date().toISOString(),
  ...over,
})

let host: HTMLDivElement
let root: Root
let listener: ((s: LidarMountStatus) => void) | null
const completed = { result: 'completed', command: {} }

const text = () => host.textContent ?? ''
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name)
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click() })
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const send = (s: LidarMountStatus) => act(() => listener?.(s))
const open = () => act(() => root.render(<SensorsPage siteId="site-dev" />))
const type = (el: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  listener = null
  provider.subscribeLidarMount.mockReset().mockImplementation((l: (s: LidarMountStatus) => void) => {
    listener = l
    return () => { if (listener === l) listener = null }
  })
  commands.setLidarMount.mockReset().mockResolvedValue(completed)
  commands.setCalibrationMode.mockReset().mockResolvedValue(completed)
  perms.configure = true
  robots.current = [robot('rover-jetson', '0.0.23'), robot('rover-pi', '0.0.22')]
  try { localStorage.clear() } catch { /* none */ }
  window.history.replaceState(null, '', '#/site/site-dev/systems/sensors')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Systems › Sensors', () => {
  it('shows in use against measured, with the spread, the basis, and height as typed only', () => {
    open()
    send(status())
    const row = (key: string) => host.querySelector(`[data-row="${key}"]`)?.textContent ?? ''
    expect(row('forward')).toBe('Forward0.234 m0.251 m ±0.008')
    expect(row('pitch')).toContain('12.4° ±0.3')
    expect(host.querySelector('[data-row="pitch"] [data-differs]')).not.toBeNull()
    expect(row('height')).toBe('Height0.250 mtyped only')
    expect(host.querySelector('[data-testid="basis"]')?.textContent).toMatch(/^From 184 turns and 5,120 still readings since/)
    expect(text()).toContain('The measurement is clearly different from what is in use.')
  })

  it('applies the measured values only after asking, warning that the position will shift', async () => {
    open()
    send(status())
    click(button('Apply measured'))
    expect(commands.setLidarMount).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('Set position in LiveOps')
    click(button('Apply'))
    await settle()
    // The tilt in use (set while walking) is kept unless asked for.
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', {
      source: 'measured', mount: { x_m: 0.251, y_m: 0.012, z_m: 0.25, roll_deg: 0, pitch_deg: 5.9, yaw_deg: 0 },
    })
    expect(text()).toContain('rover-jetson uses the new values.')
  })

  it('also applies the tilt measured standing still when that box is ticked', async () => {
    open()
    send(status())
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(box.checked).toBe(false)
    expect(text()).toContain('the tilt in use is usually set while walking')
    act(() => box.click())
    click(button('Apply measured'))
    click(button('Apply'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', {
      source: 'measured', mount: { x_m: 0.251, y_m: 0.012, z_m: 0.25, roll_deg: 0.2, pitch_deg: 12.4, yaw_deg: 0 },
    })
  })

  it('says how many turns so far while the offset is still being measured, and offers nothing to apply', () => {
    open()
    send(status({ measured: { ...status().measured!, turns: 5 } }))
    expect(host.querySelector('[data-row="forward"]')?.textContent).toContain('measuring… 5 turns so far')
    expect(button('Apply measured')?.disabled).toBe(true)
  })

  it('shows the bridge refusal verbatim', async () => {
    commands.setLidarMount.mockResolvedValue({ result: 'failed', command: { failure_reason: 'REJECTED_ROBOT_MOVING: the lidar mount cannot change while the robot is walking' } })
    open()
    send(status())
    click(button('Apply measured'))
    click(button('Apply'))
    await settle()
    expect(text()).toContain('rover-jetson refused: REJECTED_ROBOT_MOVING: the lidar mount cannot change while the robot is walking')
  })

  it('changes the mode straight away', async () => {
    open()
    send(status())
    click([...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Auto'))
    await settle()
    expect(commands.setCalibrationMode).toHaveBeenCalledWith('rover-jetson', 'auto')
  })

  it('checks typed values against the schema\'s bounds before sending them as manual', async () => {
    open()
    send(status())
    click(button('Edit values'))
    const pitch = host.querySelector<HTMLInputElement>('input[name="pitch_deg"]')!
    type(pitch, '50')
    expect(text()).toContain('Between -45° and 45°.')
    click(button('Use these values'))
    expect(commands.setLidarMount).not.toHaveBeenCalled()
    type(pitch, '8')
    click(button('Use these values'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', { source: 'manual', mount: { ...inUse, pitch_deg: 8 } })
  })

  it('lists the history newest first and reverts to an entry after asking', async () => {
    open()
    send(status())
    click(button('History'))
    const items = host.querySelectorAll('[data-change]')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('In use')
    click(button('Revert'))
    expect(commands.setLidarMount).not.toHaveBeenCalled()
    click([...host.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === 'Revert'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', { source: 'manual', mount: { ...inUse, x_m: 0, pitch_deg: 0 } })
  })

  it('shows a refusal in the robot\'s words', async () => {
    commands.setCalibrationMode.mockResolvedValue({ result: 'failed', command: { failure_reason: 'The cloud rejected the command (HTTP 403): your role does not allow SET_CALIBRATION_MODE' } })
    open()
    send(status())
    click([...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Off'))
    await settle()
    expect(text()).toContain('rover-jetson refused: The cloud rejected the command (HTTP 403): your role does not allow SET_CALIBRATION_MODE')
  })

  it('is read-only without Configure', () => {
    perms.configure = false
    open()
    send(status())
    expect(button('Apply measured')).toBeUndefined()
    expect(button('Edit values')).toBeUndefined()
    expect(text()).toContain('Changing these needs the Engineer role.')
    click(button('History'))
    expect(button('Revert')).toBeUndefined()
  })

  it('gives a bridge older than 0.0.23 a plain note, and waits for a newer one\'s first status', () => {
    localStorage.setItem('rh.systems.sensors.robot.site-dev', 'rover-pi')
    open()
    expect(text()).toContain('rover-pi’s bridge is on schema 0.0.22')
    expect(button('Apply measured')).toBeUndefined()
    act(() => root.unmount())
    root = createRoot(host)
    localStorage.clear()
    open()
    expect(text()).toContain('Waiting for rover-jetson to report its lidar mount')
  })

  it('opens on the robot the bell named, and drops it from the address', () => {
    window.history.replaceState(null, '', '#/site/site-dev/systems/sensors?robot=rover-pi')
    open()
    expect(window.location.hash).toBe('#/site/site-dev/systems/sensors')
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('rover-pi')
  })
})

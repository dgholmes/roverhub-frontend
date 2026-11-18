// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { LidarMountEstimate, LidarMountStatus } from '@/types/sensors'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider, robots, perms, commands } = vi.hoisted(() => ({
  provider: { subscribeLidarMount: vi.fn() },
  robots: { current: [] as unknown[] },
  perms: { configure: true },
  commands: { setLidarMount: vi.fn(), setCalibrationMode: vi.fn(), calibrationTurn: vi.fn(), takeControl: vi.fn() },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => robots.current }))
vi.mock('@/org/useCan', () => ({ useCan: (id: string) => (id === 'configure' ? perms.configure : true) }))
vi.mock('@/sensors/sensorCommands', () => commands)

import { SensorsPage } from './SensorsPage'

/** A real-shaped robot (the mock fleet's), standing under this console's
 * control unless told otherwise. */
const robot = (robot_id: string, schema: string | null, over: Partial<RobotState> = {}) => ({
  ...initialRobots[1], robot_id, name: robot_id, site_id: 'site-dev', abstract_state: 'STAND', sdk_state: 'balance_stand',
  posture: 'upright', control_owner: 'operator-dev', active_run: null, nav_goal: null,
  bridge: { ...initialRobots[1].bridge!, schema_version: schema }, ...over,
}) as RobotState

const inUse = { x_m: 0.234, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 19.4, yaw_deg: 0 }
/** rover-jetson on 2026-11-18: tilt right, offset waiting for turns, the last one refused. */
const today = (over: Partial<LidarMountEstimate> = {}): LidarMountEstimate => ({
  x_m: null, y_m: null, sd_x_m: null, sd_y_m: null, roll_deg: -0.6, pitch_deg: 19.4, sd_tilt_deg: 0.1,
  turns: 3, still_samples: 840, since: '2026-11-18T00:00:00Z', updated_at: new Date().toISOString(),
  turns_left: 2, turns_right: 1, offset_confident: false, tilt_confident: true,
  last_turn: { at: '2026-11-18T04:00:00Z', kept: false, reason: 'match_ambiguous', turned_deg: 176 },
  ...over,
})
/** Measured and sure of both, differing from what is in use. */
const sure = (over: Partial<LidarMountEstimate> = {}): LidarMountEstimate => today({
  x_m: 0.291, y_m: 0.012, sd_x_m: 0.008, sd_y_m: 0.006, roll_deg: 0.2, pitch_deg: 12.4, sd_tilt_deg: 0.3,
  turns: 184, turns_left: 92, turns_right: 92, offset_confident: true, still_samples: 5120,
  last_turn: { at: '2026-11-18T04:00:00Z', kept: true, reason: null, turned_deg: 179 }, ...over,
})
const status = (over: Partial<LidarMountStatus> = {}): LidarMountStatus => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', mode: 'suggest', in_use: inUse, measured: today(), differs: false,
  history: [
    { at: '2026-11-13T00:00:00Z', mount: inUse, source: 'manual', by: 'operator-dev' },
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
const buttons = () => [...host.querySelectorAll('button')]
const button = (name: string) => buttons().find((b) => b.textContent === name)
const step = (name: 'tilt' | 'offset' | 'typed') => host.querySelector<HTMLElement>(`[data-step="${name}"]`)!
const chip = (name: 'tilt' | 'offset' | 'typed') => step(name).querySelector('[data-chip]')?.textContent
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
  commands.calibrationTurn.mockReset().mockResolvedValue(completed)
  commands.takeControl.mockReset().mockResolvedValue(completed)
  perms.configure = true
  robots.current = [robot('rover-jetson', '0.0.25'), robot('rover-pi', '0.0.22')]
  try { localStorage.clear() } catch { /* none */ }
  window.history.replaceState(null, '', '#/site/site-dev/systems/sensors')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('Systems › Sensors as three steps', () => {
  it('says where rover-jetson stands today: tilt right, forward and sideways waiting for turns', () => {
    open()
    send(status())
    const summary = host.querySelector('[data-testid="summary"]')!
    expect(summary.getAttribute('data-tone')).toBe('amber')
    expect(summary.textContent).toBe('The tilt is right. Forward and sideways need more turns on the spot.')
    expect(chip('tilt')).toBe('Right')
    expect(step('tilt').textContent).toContain('In use 19.4° · measured 19.4°. The robot measures it by itself while it stands.')
    expect(chip('offset')).toBe('Turns 3/8')
    expect(step('offset').getAttribute('data-now')).toBe('true')
    const bars = [...step('offset').querySelectorAll('[role="progressbar"]')].map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-valuenow')])
    expect(bars).toEqual([['Left 2/3', '67'], ['Right 1/3', '33']])
    expect(step('offset').querySelector('[data-testid="last-turn"]')?.textContent)
      .toBe('Last turn: The surroundings look alike from every side, so it could not measure. Try where walls or furniture are in view.')
    expect(button('Apply measured')?.disabled).toBe(true)
    expect(step('offset').textContent).toContain('Turns on after 8 turns')
    expect(chip('typed')).toBe('Typed')
    expect(step('typed').querySelector('[data-testid="typed-values"]')?.textContent).toBe('Height 0.250 m · heading 0.0°')
  })

  it('says it in Korean, as the console is used', async () => {
    await act(async () => { await i18n.changeLanguage('ko') })
    try {
      open()
      send(status())
      expect(host.querySelector('[data-testid="summary"]')?.textContent).toBe('기울기는 맞습니다. 앞뒤·좌우 위치는 제자리 회전을 더 해야 잴 수 있습니다.')
      expect(chip('offset')).toBe('회전 3/8')
      expect(step('tilt').textContent).toContain('쓰는 값 19.4° · 잰 값 19.4°. 로봇이 서 있을 때 저절로 잽니다.')
      expect(step('offset').textContent).toContain('왼쪽으로 2/3')
      expect(step('offset').textContent).toContain('8번 돌면 켜집니다')
      expect(button('대신 돌려 주기')).toBeDefined()
    } finally {
      await act(async () => { await i18n.changeLanguage('en') })
    }
  })

  it('is green when both measured steps are right', () => {
    open()
    send(status({ measured: sure({ x_m: 0.24, pitch_deg: 19.0, roll_deg: 0.1 }) }))
    const summary = host.querySelector('[data-testid="summary"]')!
    expect(summary.getAttribute('data-tone')).toBe('green')
    expect(summary.textContent).toBe('The lidar’s position is all set.')
    expect(chip('offset')).toBe('Right')
    expect(button('Apply measured')).toBeUndefined()
    expect(button('Turn it for me')).toBeUndefined()
  })

  it('step 1 applies only the measured pitch and roll, after asking', async () => {
    open()
    send(status({ measured: sure({ x_m: 0.24 }) }))
    expect(chip('tilt')).toBe('Differs')
    click(button('Apply tilt'))
    expect(commands.setLidarMount).not.toHaveBeenCalled()
    expect(step('tilt').querySelector('[role="alertdialog"]')?.textContent).toContain('Set position in LiveOps')
    click(button('Apply'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', {
      source: 'measured', mount: { ...inUse, roll_deg: 0.2, pitch_deg: 12.4 },
    })
    expect(text()).toContain('rover-jetson uses the new values.')
  })

  it('step 2 applies only the measured forward and left, and shows a refusal verbatim', async () => {
    commands.setLidarMount.mockResolvedValue({ result: 'failed', command: { failure_reason: 'REJECTED_ROBOT_MOVING: the lidar mount cannot change while the robot is walking' } })
    open()
    send(status({ measured: sure({ pitch_deg: 19.4, roll_deg: 0 }) }))
    expect(chip('offset')).toBe('Differs')
    expect(button('Apply measured')?.disabled).toBe(false)
    click(button('Apply measured'))
    click(button('Apply'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', { source: 'measured', mount: { ...inUse, x_m: 0.291, y_m: 0.012 } })
    expect(text()).toContain('rover-jetson refused: REJECTED_ROBOT_MOVING: the lidar mount cannot change while the robot is walking')
  })

  it('keeps Apply measured off until the robot is confident, even with every turn counted', () => {
    open()
    send(status({ measured: today({ x_m: 0.25, y_m: 0.01, sd_x_m: 0.03, sd_y_m: 0.02, turns: 8, turns_left: 4, turns_right: 4 }) }))
    expect(chip('offset')).toBe('Turns 8/8')
    expect(step('offset').textContent).toContain('It has turned 8 times, but the value is still settling. Turn it a few more times.')
    expect(step('offset').textContent).toContain('Turns on once the value settles')
    expect(button('Apply measured')?.disabled).toBe(true)
  })

  it('shows the total only, with no bars, from a bridge older than 0.0.25', () => {
    open()
    send(status({ measured: today({ turns: 5, turns_left: null, turns_right: null, offset_confident: null, tilt_confident: null, last_turn: null }) }))
    expect(chip('offset')).toBe('Turns 5/8')
    expect(step('offset').querySelector('[role="progressbar"]')).toBeNull()
    expect(step('offset').querySelector('[data-testid="last-turn"]')).toBeNull()
  })

  it('step 3 opens the typed values and sends them as manual, checked against the bounds', async () => {
    open()
    send(status())
    click(button('Edit values'))
    const z = host.querySelector<HTMLInputElement>('input[name="z_m"]')!
    type(z, '2')
    expect(text()).toContain('Between -0.5 m and 1.5 m.')
    click(button('Use these values'))
    expect(commands.setLidarMount).not.toHaveBeenCalled()
    type(z, '0.31')
    click(button('Use these values'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', { source: 'manual', mount: { ...inUse, z_m: 0.31 } })
  })
})

describe('folded underneath', () => {
  it('keeps the value table folded until asked, with the new headings, and remembers it per viewer', () => {
    open()
    send(status({ measured: sure() }))
    expect(host.querySelector('[role="table"]')).toBeNull()
    click(button('All values'))
    const heads = [...host.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)
    expect(heads).toEqual(['Measure', 'Robot uses', 'Robot measured'])
    expect(host.querySelector('[data-row="forward"]')?.textContent).toBe('Forward0.234 m0.291 m ±0.008')
    expect(host.querySelector('[data-testid="basis"]')?.textContent).toMatch(/^From 184 turns and 5,120 still readings since/)
    act(() => root.unmount())
    root = createRoot(host)
    open()
    send(status({ measured: sure() }))
    expect(host.querySelector('[role="table"]')).not.toBeNull()
  })

  it('changes the mode from its fold, each mode with its one line', async () => {
    open()
    send(status())
    click(button('Measuring: Suggest'))
    expect(text()).toContain('The robot applies a clear difference itself')
    click([...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Auto'))
    await settle()
    expect(commands.setCalibrationMode).toHaveBeenCalledWith('rover-jetson', 'auto')
  })

  it('shows a mode refusal in the robot\'s words', async () => {
    commands.setCalibrationMode.mockResolvedValue({ result: 'failed', command: { failure_reason: 'The cloud rejected the command (HTTP 403): your role does not allow SET_CALIBRATION_MODE' } })
    open()
    send(status())
    click(button('Measuring: Suggest'))
    click([...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Off'))
    await settle()
    expect(text()).toContain('rover-jetson refused: The cloud rejected the command (HTTP 403): your role does not allow SET_CALIBRATION_MODE')
  })

  it('lists the history with names, newest first, and reverts after asking', async () => {
    open()
    send(status())
    click(button('History (2)'))
    const items = host.querySelectorAll('[data-change]')
    expect(items).toHaveLength(2)
    // Sign-in off: the dev user's own name, no id.
    expect(items[0].textContent).toContain('Typed · by Developer')
    expect(items[0].textContent).toContain('In use')
    click(button('Revert'))
    expect(commands.setLidarMount).not.toHaveBeenCalled()
    click([...host.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === 'Revert'))
    await settle()
    expect(commands.setLidarMount).toHaveBeenCalledWith('rover-jetson', { source: 'manual', mount: { ...inUse, x_m: 0, pitch_deg: 0 } })
  })

  it('says measuring is off when it is', () => {
    open()
    send(status({ mode: 'off', measured: null }))
    expect(host.querySelector('[data-testid="summary"]')?.textContent).toContain('Measuring is off')
  })
})

describe('without Configure', () => {
  it('shows the same steps with no buttons', () => {
    perms.configure = false
    open()
    send(status({ measured: sure() }))
    expect(step('tilt')).not.toBeNull()
    expect(button('Apply tilt')).toBeUndefined()
    expect(button('Apply measured')).toBeUndefined()
    expect(button('Edit values')).toBeUndefined()
    expect(button('Turn it for me')).toBeUndefined()
    expect(text()).toContain('Changing these needs the Engineer role.')
    click(button('History (2)'))
    expect(button('Revert')).toBeUndefined()
  })
})

describe('Turn it for me', () => {
  const run = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  it('is off with the one reason while nobody holds control, and offers Take control', async () => {
    robots.current = [robot('rover-jetson', '0.0.25', { control_owner: null })]
    open()
    send(status())
    expect(button('Turn it for me')?.disabled).toBe(true)
    expect(step('offset').textContent).toContain('Take control in LiveOps first.')
    click(button('Take control'))
    await settle()
    expect(commands.takeControl).toHaveBeenCalledWith('rover-jetson', expect.any(String))
  })

  it('is off while someone else drives, or the robot lies down', () => {
    robots.current = [robot('rover-jetson', '0.0.25', { control_owner: 'eng-2' })]
    open()
    send(status())
    expect(step('offset').textContent).toContain('Someone else has control.')
    expect(button('Take control')).toBeUndefined()
    robots.current = [robot('rover-jetson', '0.0.25', { abstract_state: 'PASSIVE', sdk_state: 'ready' })]
    open()
    expect(step('offset').textContent).toContain('Stand the robot up first.')
  })

  it('asks in place, then turns left, right, … each to its ack with a still wait, showing the turn', async () => {
    vi.useFakeTimers()
    open()
    send(status())
    expect(button('Turn it for me')?.disabled).toBe(false)
    expect(step('offset').textContent).toContain('Only while the robot stands and you hold control')
    click(button('Turn it for me'))
    expect(step('offset').querySelector('[role="alertdialog"]')?.textContent)
      .toContain('The robot turns half a turn on the spot 8 times, 4 each way, about a minute. Clear 1 m around it and watch.')
    expect(commands.calibrationTurn).not.toHaveBeenCalled()
    click(button('Start'))
    expect(chip('offset')).toBe('Turning 1/8')
    expect(step('offset').textContent).toContain('The turn under way finishes. To stop at once, use E-Stop.')
    await run(2000)
    expect(commands.calibrationTurn).toHaveBeenCalledWith('rover-jetson', 'left', 180, 1, 8)
    await run(3000)
    expect(commands.calibrationTurn).toHaveBeenLastCalledWith('rover-jetson', 'right', 180, 2, 8)
    expect(chip('offset')).toBe('Turning 2/8')
    // The robot's own counts keep showing while it turns.
    send(status({ measured: today({ turns: 4, turns_left: 3, last_turn: { at: '2026-11-18T05:00:00Z', kept: true, reason: null, turned_deg: 179 } }) }))
    expect(step('offset').textContent).toContain('Left 3/3')
    // Then the robot is sure: no more turns, and the page says what to do.
    send(status({ measured: sure({ pitch_deg: 19.4, roll_deg: 0 }) }))
    await run(10_000)
    expect(commands.calibrationTurn).toHaveBeenCalledTimes(2)
    expect(step('offset').textContent).toContain('Measured. Check the values and apply them.')
    expect(chip('offset')).toBe('Differs')
  })

  it('Stop sends no more turns after the one in flight', async () => {
    vi.useFakeTimers()
    let finish: (v: unknown) => void = () => {}
    commands.calibrationTurn.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    open()
    send(status())
    click(button('Turn it for me'))
    click(button('Start'))
    await run(2000)
    click(button('Stop'))
    expect(step('offset').textContent).toContain('Stopping after this turn…')
    await act(async () => { finish(completed) })
    await run(10_000)
    expect(commands.calibrationTurn).toHaveBeenCalledTimes(1)
    expect(step('offset').textContent).toContain('Stopped.')
  })

  it('ends with the ack\'s reason when a turn is refused', async () => {
    vi.useFakeTimers()
    commands.calibrationTurn.mockResolvedValue({ result: 'failed', command: { failure_reason: 'REJECTED_BATTERY_LOW: 12%' } })
    open()
    send(status())
    click(button('Turn it for me'))
    click(button('Start'))
    await run(3000)
    expect(step('offset').textContent).toContain('Stopped: a turn failed. REJECTED_BATTERY_LOW: 12%')
  })

  it('leaving the page sends no more turns', async () => {
    vi.useFakeTimers()
    open()
    send(status())
    click(button('Turn it for me'))
    click(button('Start'))
    await run(2500)
    expect(commands.calibrationTurn).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    root = createRoot(host)
    await run(60_000)
    expect(commands.calibrationTurn).toHaveBeenCalledTimes(1)
  })
})

describe('older bridges and the bell', () => {
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

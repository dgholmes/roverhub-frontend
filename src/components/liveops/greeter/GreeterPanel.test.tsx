// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { DEFAULT_GREETER_SETTING, type Command, type GreeterStatus, type RobotState } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Greeter mode's switch and settings: the schema's defaults, the spec's
 * confirmation before turning on, ONE SET_GREETER with every field and the
 * clip made first, and an older bridge shown as "update the robot".
 */

const { store } = vi.hoisted(() => ({
  store: {
    createSpokenClip: vi.fn(async (_robotId: string, _text: string) => ({ clip_id: 'clip-9' })),
    dispatchCommandAsync: vi.fn(async (..._args: unknown[]) => ({ result: 'completed', command: {} as Command })),
  } as Record<string, ReturnType<typeof vi.fn>>,
}))
vi.mock('@/store/useLiveOpsStore', () => {
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(store)
  useLiveOpsStore.getState = () => store
  return { useLiveOpsStore }
})

import { GreeterPanel } from './GreeterPanel'

const off: GreeterStatus = { enabled: false, phase: 'off', blocked_reason: null, last_greeted_at: null, greetings_today: 0, setting: null }
const robot = (greeter: GreeterStatus | null | undefined): RobotState =>
  ({ ...initialRobots[1], robot_id: 'rover-jetson', name: 'rover-jetson', greeter })

let host: HTMLDivElement
let root: Root
let saved: number

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  try { localStorage.clear() } catch { /* none */ }
  store.createSpokenClip.mockClear()
  store.dispatchCommandAsync.mockClear()
  store.dispatchCommandAsync.mockImplementation(async () => ({ result: 'completed', command: {} as Command }))
  saved = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(r: RobotState) {
  act(() => root.render(<GreeterPanel robot={r} onSaved={() => { saved += 1 }} />))
}
const sw = () => host.querySelector<HTMLButtonElement>('[role="switch"]')!
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
const number = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

describe('GreeterPanel', () => {
  it('starts from the schema defaults on a robot with no setting', () => {
    render(robot(off))
    expect(sw().getAttribute('aria-checked')).toBe('false')
    expect(number('Greet someone walking up within').value).toBe('3')
    expect(number('Greet someone facing it within').value).toBe('4')
    expect(number('No dance if anyone is closer than').value).toBe('1.5')
    expect(number('Same person again after').value).toBe('5') // 300 s, in minutes
    expect(number('Only above battery').value).toBe('30')
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Dance"]')!.value).toBe('groove')
  })

  it('asks first, in the spec\'s words, before turning on, and Cancel leaves it off', () => {
    render(robot(off))
    act(() => sw().click())
    const dialog = host.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain('The robot will wave, speak and dance by itself when it sees people. Make sure there is clear space around it.')
    expect(dialog?.textContent).toContain('Works only while the robot stands')
    expect(sw().getAttribute('aria-checked')).toBe('false')
    act(() => button('Cancel')!.click())
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(sw().getAttribute('aria-checked')).toBe('false')
    expect(store.dispatchCommandAsync).not.toHaveBeenCalled()
  })

  it('sends ONE SET_GREETER with every field and the greeting made into a clip first', async () => {
    render(robot(off))
    act(() => sw().click())
    act(() => button('Turn on')!.click())
    expect(sw().getAttribute('aria-checked')).toBe('true')
    await act(async () => { button('Save')!.click() })
    await flush()
    expect(store.createSpokenClip).toHaveBeenCalledTimes(1)
    expect(store.createSpokenClip.mock.calls[0][1]).toBe('안녕하세요, 재재입니다')
    expect(store.dispatchCommandAsync).toHaveBeenCalledTimes(1)
    const [robotId, type, , params] = store.dispatchCommandAsync.mock.calls[0]
    expect(robotId).toBe('rover-jetson')
    expect(type).toBe('SET_GREETER')
    expect(params).toEqual({ ...DEFAULT_GREETER_SETTING, enabled: true, clip_id: 'clip-9' })
    expect(saved).toBe(1)
  })

  it('keeps the robot\'s greeting without remaking it, and turns off without asking', async () => {
    const on: GreeterStatus = {
      ...off, enabled: true, phase: 'watching',
      setting: { ...DEFAULT_GREETER_SETTING, enabled: true, clip_id: 'held-clip', cooldown_s: 600 },
    }
    render(robot(on))
    expect(sw().getAttribute('aria-checked')).toBe('true')
    act(() => sw().click())
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    await act(async () => { button('Save')!.click() })
    await flush()
    expect(store.createSpokenClip).not.toHaveBeenCalled()
    expect(store.dispatchCommandAsync.mock.calls[0][3]).toMatchObject({ enabled: false, clip_id: 'held-clip', cooldown_s: 600 })
  })

  it('shows the robot\'s refusal in words and stays open', async () => {
    store.dispatchCommandAsync.mockImplementation(async () => ({
      result: 'failed', command: { failure_reason: 'REJECTED_ESTOP' } as Command,
    }))
    render(robot(off))
    await act(async () => { button('Save')!.click() })
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/^Not saved: /)
    expect(saved).toBe(0)
  })

  it.each([undefined, null])('on a bridge older than 0.0.36 (greeter %s) says to update, with the switch and Save disabled', async (g) => {
    render(robot(g))
    expect(host.querySelector('[data-greeter-old-bridge]')?.textContent).toBe('Update the robot to use this')
    expect(sw().disabled).toBe(true)
    expect(button('Save')!.disabled).toBe(true)
    await act(async () => { button('Save')!.click() })
    expect(store.dispatchCommandAsync).not.toHaveBeenCalled()
  })
})

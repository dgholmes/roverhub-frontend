// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { Command, CommandAvailability } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Speak's Greet tab: saved greetings, a typed one, the dance, and GREET sent
 * through the tracked command path with the clip Say would have made.
 */

const { store } = vi.hoisted(() => ({
  store: {
    createSpokenClip: vi.fn(async (_robotId: string, _text: string) => ({ clip_id: 'clip-1' })),
    dispatchCommandAsync: vi.fn(async (..._args: unknown[]) => ({ result: 'completed', command: {} as Command })),
  } as Record<string, ReturnType<typeof vi.fn>>,
}))
vi.mock('@/store/useLiveOpsStore', () => {
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(store)
  useLiveOpsStore.getState = () => store
  return { useLiveOpsStore }
})

import { GreetPanel } from './GreetPanel'

let host: HTMLDivElement
let root: Root

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  try { localStorage.clear() } catch { /* none */ }
  store.createSpokenClip.mockClear()
  store.createSpokenClip.mockImplementation(async () => ({ clip_id: 'clip-1' }))
  store.dispatchCommandAsync.mockClear()
  store.dispatchCommandAsync.mockImplementation(async () => ({ result: 'completed', command: {} as Command }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(availability: CommandAvailability = { enabled: true }) {
  act(() => root.render(<GreetPanel robotId="rover-jetson" availability={availability} volume={70} />))
}
const buttons = () => [...host.querySelectorAll('button')]
const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text)
const radios = () => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

describe('GreetPanel', () => {
  it('offers the Korean and English default greetings, the first chosen, and Groove', () => {
    render()
    expect(radios().map((r) => r.textContent)).toContain('안녕하세요, 재재입니다')
    expect(radios().map((r) => r.textContent)).toContain('Hello, welcome!')
    expect(radios()[0].getAttribute('aria-checked')).toBe('true')
    expect(host.querySelector('select')!.value).toBe('groove')
  })

  it('makes the clip as Say does, then sends GREET with the clip, the dance and the volume', async () => {
    render()
    act(() => radios()[2].click())
    await act(async () => { button('Greet')!.click() })
    await flush()
    expect(store.createSpokenClip).toHaveBeenCalledWith('rover-jetson', radios()[2].textContent)
    expect(store.dispatchCommandAsync).toHaveBeenCalledTimes(1)
    const [robotId, type, label, params] = store.dispatchCommandAsync.mock.calls[0]
    expect(robotId).toBe('rover-jetson')
    expect(type).toBe('GREET')
    expect(label).toContain('Greet')
    expect(params).toEqual({ clip_id: 'clip-1', dance: 'groove', volume: 70 })
  })

  it('sends no dance when "No dance" is chosen, and a typed greeting', async () => {
    render()
    act(() => setValue(host.querySelector('select')!, ''))
    act(() => setValue(host.querySelector<HTMLInputElement>('input[aria-label="Custom greeting"]')!, 'Good morning'))
    await act(async () => { button('Greet')!.click() })
    await flush()
    expect(store.createSpokenClip).toHaveBeenCalledWith('rover-jetson', 'Good morning')
    expect(store.dispatchCommandAsync.mock.calls[0][3]).toEqual({ clip_id: 'clip-1', dance: null, volume: 70 })
  })

  it('shows the robot\'s refusal in words', async () => {
    store.dispatchCommandAsync.mockImplementation(async () => ({
      result: 'failed',
      command: { failure_reason: 'REJECTED_NOT_STANDING: the robot is not standing still' } as Command,
    }))
    render()
    await act(async () => { button('Greet')!.click() })
    await flush()
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('the robot is not standing; stand it up, then greet')
  })

  it('shows the speech engine\'s own words when the clip cannot be made, and sends nothing', async () => {
    store.createSpokenClip.mockImplementation(async () => { throw new Error('No Korean voice is installed') })
    render()
    await act(async () => { button('Greet')!.click() })
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('No Korean voice is installed')
    expect(store.dispatchCommandAsync).not.toHaveBeenCalled()
  })

  it('is disabled with the policy\'s reason, and pressing it sends nothing', async () => {
    render({ enabled: false, reason: 'Stand the robot up first' })
    expect(host.querySelector('[data-greet-blocked]')?.textContent).toBe('Stand the robot up first')
    const greet = button('Greet')!
    expect(greet.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { greet.click() })
    expect(store.createSpokenClip).not.toHaveBeenCalled()
    expect(store.dispatchCommandAsync).not.toHaveBeenCalled()
  })

  it('saves a typed greeting to the list and the browser, and removes one', () => {
    render()
    const before = radios().length
    act(() => setValue(host.querySelector<HTMLInputElement>('input[aria-label="Custom greeting"]')!, 'See you soon'))
    act(() => button('Save this greeting')!.click())
    expect(radios().length).toBe(before + 1)
    expect(radios()[radios().length - 1].textContent).toBe('See you soon')
    expect(JSON.stringify(Object.values(localStorage))).toContain('See you soon')
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Remove See you soon"]')!.click())
    expect(radios().length).toBe(before)
  })
})

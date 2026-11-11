// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { DEFAULT_DRIVE_SPEED, speedPctOf, useDriveSpeedStore } from '@/store/useDriveSpeedStore'
import { SpeedControl } from './SpeedControl'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

const pctFor = (robotId: string) =>
  speedPctOf(useDriveSpeedStore.getState().speeds[robotId] ?? DEFAULT_DRIVE_SPEED)

/** The bar button; the card is portalled to <body>, so everything else is
 * looked up on the document. */
const button = () => container.querySelector<HTMLButtonElement>('button')!
const slider = () => document.querySelector<HTMLInputElement>('input[type="range"]')
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]

function tab(name: string): HTMLButtonElement {
  const found = tabs().find((b) => b.textContent === name)
  if (!found) throw new Error(`no ${name} tab`)
  return found
}

/** Moves a React-controlled range input, as dragging it would. */
function slide(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  useDriveSpeedStore.setState({ speeds: {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<SpeedControl robotId="rover-pi" />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('SpeedControl', () => {
  it('is a button reading the current %, with the card closed', () => {
    expect(button().textContent).toBe('Speed 60%')
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(slider()).toBeNull()
  })

  it('opens a card of Slow / Normal / Fast and a slider, with no Custom choice', () => {
    act(() => button().click())
    expect(tabs().map((b) => b.textContent)).toEqual(['Slow', 'Normal', 'Fast'])
    expect(tab('Normal').getAttribute('aria-selected')).toBe('true')
    const s = slider()!
    expect([s.min, s.max, s.step, s.value]).toEqual(['10', '80', '5', '60'])
  })

  it('sets the stored % for this robot when a preset is chosen', () => {
    act(() => button().click())
    act(() => tab('Slow').click())
    expect(pctFor('rover-pi')).toBe(30)
    expect(button().textContent).toBe('Speed 30%')
    expect(slider()!.value).toBe('30')
    act(() => tab('Fast').click())
    expect(pctFor('rover-pi')).toBe(80)
    expect(pctFor('rover-jetson')).toBe(60)
  })

  it('sets a custom % from the slider, and then lights no preset', () => {
    act(() => button().click())
    act(() => slide(slider()!, 45))
    expect(useDriveSpeedStore.getState().speeds['rover-pi']).toEqual({ tier: 'custom', customPct: 45 })
    expect(button().textContent).toBe('Speed 45%')
    expect(tabs().every((b) => b.getAttribute('aria-selected') === 'false')).toBe(true)
    act(() => tab('Normal').click())
    expect(tab('Normal').getAttribute('aria-selected')).toBe('true')
    expect(slider()!.value).toBe('60')
  })

  it('toggles from its own button', () => {
    act(() => button().click())
    expect(slider()).not.toBeNull()
    act(() => {
      button().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      button().click()
    })
    expect(slider()).toBeNull()
  })
})

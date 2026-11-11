// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { zIndex } from '@/design-system/tokens'
import { useCardStack } from '@/liveops/barCardStack'
import { BarCard } from '@/components/liveops/command/BarCard'
import { AlertCenterButton } from './AlertCenterButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

/** A command-bar card to share the stack with. */
function Speak() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref}>
      <button data-open="speak" onClick={() => setOpen((o) => !o)}>Speak</button>
      <BarCard open={open} onClose={() => setOpen(false)} anchorRef={ref} width={200}>card</BarCard>
    </div>
  )
}

const alerts = () => document.querySelector<HTMLElement>('[data-alert-panel]')
const barCard = () => document.querySelector<HTMLElement>('[data-bar-card]')
const z = (el: HTMLElement | null) => Number(el!.style.zIndex)
// `.click()` sends no mousedown, so opening one leaves the other open.
const openAlerts = () => act(() => container.querySelector<HTMLButtonElement>('[data-alerts] button')!.click())
const openSpeak = () => act(() => container.querySelector<HTMLButtonElement>('[data-open="speak"]')!.click())
const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })

beforeEach(() => {
  useCardStack.setState({ order: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<><div data-alerts=""><AlertCenterButton direction="up" /></div><Speak /></>))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AlertCenterButton in the card stack', () => {
  it('sits on the floating-card layer, below dialogs', () => {
    openAlerts()
    expect(z(alerts())).toBeGreaterThanOrEqual(zIndex.floatingCard)
    expect(z(alerts())).toBeLessThan(zIndex.modal)
  })

  it('goes over a bar card opened before it, and under one opened after', () => {
    openSpeak()
    openAlerts()
    expect(z(alerts())).toBeGreaterThan(z(barCard()))
    act(() => { barCard()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(z(barCard())).toBeGreaterThan(z(alerts()))
  })

  it('comes back to the top when pressed inside', () => {
    openAlerts()
    openSpeak()
    act(() => { alerts()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(z(alerts())).toBeGreaterThan(z(barCard()))
  })

  it('Esc closes only the top card, whichever kind it is', () => {
    openSpeak()
    openAlerts()
    esc()
    expect(alerts()).toBeNull()
    expect(barCard()).not.toBeNull()

    openAlerts()  // Speak is still open, now under it
    act(() => { barCard()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    esc()
    expect(barCard()).toBeNull()
    expect(alerts()).not.toBeNull()
  })
})

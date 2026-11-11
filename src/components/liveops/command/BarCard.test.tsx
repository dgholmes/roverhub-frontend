// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { zIndex } from '@/design-system/tokens'
import { useCardStack } from '@/liveops/barCardStack'
import { BarCard } from './BarCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function Opener({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref}>
      <button data-open={name} onClick={() => setOpen((o) => !o)}>{name}</button>
      <BarCard open={open} onClose={() => setOpen(false)} anchorRef={ref} width={200}>
        <button data-inside={name}>inside {name}</button>
      </BarCard>
    </div>
  )
}

const card = (name: string) =>
  document.querySelector<HTMLElement>(`[data-inside="${name}"]`)?.closest<HTMLElement>('[data-bar-card]') ?? null
const press = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
const opener = (name: string) => container.querySelector<HTMLButtonElement>(`[data-open="${name}"]`)!

beforeEach(() => {
  useCardStack.setState({ order: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<><Opener name="a" /><Opener name="b" /></>))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('BarCard', () => {
  it('renders into <body>, fixed, on the floating-card layer', () => {
    act(() => opener('a').click())
    const a = card('a')!
    expect(container.contains(a)).toBe(false)
    expect(a.style.position).toBe('fixed')
    expect(Number(a.style.zIndex)).toBeGreaterThanOrEqual(zIndex.floatingCard)
    expect(Number(a.style.zIndex)).toBeLessThan(zIndex.modal)
  })

  it('stays open for a press inside it, and closes on one outside', () => {
    act(() => opener('a').click())
    act(() => { press(document.querySelector('[data-inside="a"]')!) })
    expect(card('a')).not.toBeNull()
    act(() => { press(document.body) })
    expect(card('a')).toBeNull()
  })

  it('closes on Esc', () => {
    act(() => opener('a').click())
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(card('a')).toBeNull()
  })

  it('puts the latest opened on top, and raises one when pressed inside', () => {
    // `.click()` sends no mousedown, so opening b leaves a open -- as two cards
    // can be when one opens another, or by keyboard.
    act(() => opener('a').click())
    act(() => opener('b').click())
    expect(Number(card('b')!.style.zIndex)).toBeGreaterThan(Number(card('a')!.style.zIndex))
    act(() => { card('a')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(Number(card('a')!.style.zIndex)).toBeGreaterThan(Number(card('b')!.style.zIndex))
  })

  it('closes only the top card on Esc', () => {
    act(() => opener('a').click())
    act(() => opener('b').click())
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(card('b')).toBeNull()
    expect(card('a')).not.toBeNull()
  })
})

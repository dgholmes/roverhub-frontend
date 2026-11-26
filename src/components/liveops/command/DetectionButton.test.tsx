// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState, SetDetectionParams } from '@/types'
import { DetectionButton } from './DetectionButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The LiveOps "AI" control: a one-click toggle, and a chevron that opens the
 * AI detection card (the same DetectionPanel Fleet draws). Seeded by the mock
 * perception: zaezae-x1-001 is on with all three detectors, zaezae-x1-003 has
 * no perception at all.
 */
const robot = (id: string): RobotState => {
  const r = initialRobots.find((x) => x.robot_id === id)
  if (!r) throw new Error(`no mock robot ${id}`)
  return r
}

let container: HTMLDivElement
let root: Root
let sent: { params: SetDetectionParams; label: string }[]

function render(r: RobotState) {
  sent = []
  act(() => root.render(<DetectionButton robot={r} onSend={(params, label) => sent.push({ params, label })} />))
}

const chevron = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-pressed]')
const card = () => document.querySelector('[role="group"]')

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('DetectionButton', () => {
  it('switches detection with one click, without opening the card', () => {
    render(robot('zaezae-x1-001'))
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true')
    act(() => toggle()!.click())
    expect(sent).toHaveLength(1)
    expect(sent[0].params.enabled).toBe(false)
    expect(card()).toBeNull()
  })

  it('opens the AI detection card from the chevron, with a box per detector', () => {
    render(robot('zaezae-x1-001'))
    expect(chevron()?.getAttribute('aria-expanded')).toBe('false')
    act(() => chevron()!.click())
    expect(chevron()?.getAttribute('aria-expanded')).toBe('true')
    const boxes = [...card()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes).toHaveLength(3)
    expect(boxes.every((b) => b.checked)).toBe(true)
    expect(document.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    expect(sent).toHaveLength(0)
  })

  it('sends a detector choice from the card and shows it as applying', () => {
    render(robot('zaezae-x1-001'))
    act(() => chevron()!.click())
    const falls = [...card()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')][2]
    act(() => falls.click())
    expect(sent).toHaveLength(1)
    expect(sent[0].params.enabled).toBe(true)
    expect(sent[0].params.detectors).not.toContain('base.fall')
    // The card says it is being applied, and keeps the new choice shown.
    expect(document.body.textContent).toMatch(/Applying/)
    expect(falls.checked).toBe(false)
  })

  it('has no chevron for a robot without perception', () => {
    render(robot('zaezae-x1-003'))
    expect(chevron()).toBeNull()
  })
})

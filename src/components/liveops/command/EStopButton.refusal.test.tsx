// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ESTOP_HOLD_MS } from '@/liveops/estopHold'
import type { Command, CommandAvailability } from '@/types'
import { EStopButton } from './EStopButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const on: CommandAvailability = { enabled: true } as CommandAvailability
const failedEstop = (failure_reason: string): Command => ({
  command_id: 'estop-2', robot_id: 'r1', type: 'ESTOP', label: 'E-Stop',
  stages: [{ stage: 'execution_failed', at: '2026-11-11T00:00:00Z' }], current_stage: 'execution_failed',
  initiated_by: 'operator-dev', failure_reason,
} as Command)

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

/** Hold the button to fire, then have the robot refuse the stop with `reason`. */
function failWith(reason: string) {
  const render = (engageCommand?: Command) => act(() => root.render(
    <EStopButton state="STAND" estopAvailability={on} resetAvailability={on} onEngage={() => {}} onRelease={() => {}} engageCommand={engageCommand} />,
  ))
  render()
  const button = host.querySelector('button')!
  act(() => { button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  act(() => { vi.advanceTimersByTime(ESTOP_HOLD_MS + 10) })
  render(failedEstop(reason))
  return host.querySelector('#estop-failure') as HTMLElement
}

describe('a refused E-Stop', () => {
  it('says why in words, with the raw reason as the tooltip', () => {
    const raw = 'REJECTED_EXPIRED: arrived 4.2 s after it was sent'
    const banner = failWith(raw)
    expect(banner).not.toBeNull()
    expect(banner.textContent).toContain(i18n.t('command.refusal.code.REJECTED_EXPIRED'))
    expect(banner.textContent).not.toContain('REJECTED_')
    expect(banner.querySelector(`[title="${raw}"]`)).not.toBeNull()
  })

  it('still names a code this build has no words for', () => {
    const banner = failWith('REJECTED_BRAND_NEW')
    expect(banner.textContent).toContain(i18n.t('command.refusal.unknown'))
    expect(banner.textContent).toContain('REJECTED_BRAND_NEW')
  })

  it('shows its own wording, not a code, for a reason that is not a refusal', () => {
    const banner = failWith('No response from the robot')
    expect(banner.textContent).toContain('No response from the robot')
  })
})

describe('fill', () => {
  /** The button's own markup, with and without `fill`. */
  function surfaceStyle(fill: boolean): string {
    act(() => root.render(
      <EStopButton
        state="STAND" estopAvailability={on} resetAvailability={on}
        onEngage={() => {}} onRelease={() => {}} fill={fill || undefined}
      />,
    ))
    return host.querySelector('button')!.getAttribute('style') ?? ''
  }

  // The corner stop on the touch console is 96 x 60 on a tablet and 72 x 44
  // on a phone. Without this the component keeps the desktop command bar's
  // 148 x 48 -- set INLINE, so no rule a caller writes can shrink it -- and
  // overflows its box: the label was clipped off the right of the screen.
  it('takes its box from the caller instead of the desktop bar size', () => {
    const filled = surfaceStyle(true)
    expect(filled).not.toContain('min-width: 148px')
    expect(filled).toContain('height: 100%')
    // `flex: 1`, not a percentage width: the corner box sizes itself to this
    // button so a long label widens it instead of being clipped, and a
    // percentage against a shrink-to-fit parent is circular.
    expect(filled).toContain('flex: 1')
    expect(filled).not.toContain('width: 100%')
  })

  it('keeps the desktop size by default', () => {
    const plain = surfaceStyle(false)
    expect(plain).toContain('min-width: 148px')
    expect(plain).toContain('height: 48px')
  })
})

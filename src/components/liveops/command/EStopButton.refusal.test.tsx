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

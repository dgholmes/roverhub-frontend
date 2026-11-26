// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { GreeterPhase, GreeterStatus } from '@/types'
import { GreeterStatusChip } from './GreeterStatusChip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  act(() => root.unmount())
  host.remove()
  await i18n.changeLanguage('en')
})

const status = (phase: GreeterPhase, blocked_reason: string | null = null): GreeterStatus =>
  ({ enabled: phase !== 'off', phase, blocked_reason, last_greeted_at: null, greetings_today: 0, setting: null })
const render = (s: GreeterStatus) => act(() => root.render(<GreeterStatusChip status={s} />))

describe('GreeterStatusChip', () => {
  it.each([
    ['off', 'Off', '꺼짐', ''],
    ['watching', 'Watching', '감시 중', 'rh-badge--green'],
    ['greeting', 'Greeting', '인사 중', 'rh-badge--accent'],
    ['cooldown', 'Cooldown', '대기 중', ''],
    ['blocked', 'Blocked', '차단됨', 'rh-badge--amber'],
  ] as const)('%s reads "%s" / "%s"', async (phase, en, ko, tone) => {
    await i18n.changeLanguage('en')
    render(status(phase))
    const badge = host.querySelector('.rh-badge')!
    expect(badge.textContent).toBe(en)
    if (tone) expect(badge.classList.contains(tone)).toBe(true)
    // Only Watching carries the live dot.
    expect(!!badge.querySelector('.rh-dot')).toBe(phase === 'watching')
    await act(async () => { await i18n.changeLanguage('ko') })
    expect(host.querySelector('.rh-badge')!.textContent).toBe(ko)
  })

  it('says why it is blocked, in plain words', async () => {
    await i18n.changeLanguage('en')
    render(status('blocked', 'no_depth'))
    expect(host.querySelector('[data-greeter-reason]')?.textContent).toBe('cannot measure distance')
    await act(async () => { await i18n.changeLanguage('ko') })
    expect(host.querySelector('[data-greeter-reason]')?.textContent).toBe('거리를 측정할 수 없음')
  })

  it('shows a reason this console does not know as the robot sent it', () => {
    render(status('blocked', 'too_dark'))
    expect(host.querySelector('[data-greeter-reason]')?.textContent).toBe('too_dark')
  })

  it('has no reason while watching', () => {
    render(status('watching'))
    expect(host.querySelector('[data-greeter-reason]')).toBeNull()
  })
})

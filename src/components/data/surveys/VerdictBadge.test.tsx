// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { VerdictBadge } from './VerdictBadge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  await i18n.changeLanguage('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = async (el: React.ReactElement) => {
  await act(async () => root.render(el))
  return host.textContent ?? ''
}

// The spec's anti-goal (§2): a take is never "good" when nothing was judged,
// or when FAST-LIO2 fell behind the player.
describe('a take’s verdict badge', () => {
  it('says no drift only when a segment was judged and none was bad', async () => {
    expect(await render(<VerdictBadge hasLegs firstBadS={null} judged />)).toBe('No drift found')
  })

  it('says not judged when legs are there but no segment could be judged', async () => {
    expect(await render(<VerdictBadge hasLegs firstBadS={null} judged={false} />)).toBe('Not judged')
  })

  it('says not judged when FAST-LIO2 fell behind, whatever the segments say', async () => {
    expect(await render(<VerdictBadge hasLegs firstBadS={null} judged keptUp={false} />)).toBe('Not judged')
    expect(await render(<VerdictBadge hasLegs firstBadS={120} judged keptUp={false} />)).toBe('Not judged')
    expect(host.querySelector('[title]')?.getAttribute('title')).toMatch(/fell behind/i)
  })

  it('keeps the list’s behaviour when whether anything was judged is not known', async () => {
    expect(await render(<VerdictBadge hasLegs firstBadS={null} />)).toBe('No drift found')
    expect(await render(<VerdictBadge hasLegs={false} firstBadS={null} />)).toBe('No leg odometry')
  })

  it('reads the time as the page’s clock does', async () => {   // m:ss, floored
    expect(await render(<VerdictBadge hasLegs firstBadS={300} judged />)).toBe('Drift from 5:00')
    expect(await render(<VerdictBadge hasLegs firstBadS={59.6} judged />)).toBe('Drift from 0:59')
  })

  it('speaks Korean', async () => {
    await i18n.changeLanguage('ko')
    expect(await render(<VerdictBadge hasLegs firstBadS={null} judged={false} />)).toBe('판단 안 됨')
  })
})

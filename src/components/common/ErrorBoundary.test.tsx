// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useEffect } from 'react'
import { ErrorBoundary, onCaughtError } from './ErrorBoundary'

// React only runs error boundaries in a real render, so this file needs a DOM.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  // React logs a caught error itself as well; keep the run quiet but inspectable.
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  errorLog.mockRestore()
})

const failing = { on: true }
function Flaky() {
  if (failing.on) throw new Error('bad frame')
  return <span data-testid="ok">fine</span>
}

describe('ErrorBoundary', () => {
  it('shows a plain fallback with the error message instead of its children', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map"><Flaky /></ErrorBoundary>))
    expect(host.querySelector('[data-testid="ok"]')).toBeNull()
    expect(host.textContent).toContain(i18n.t('common.errorBoundary.view'))
    expect(host.textContent).toContain('bad frame')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('logs the error with the component stack', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map"><Flaky /></ErrorBoundary>))
    const ours = errorLog.mock.calls.find((c) => String(c[0]).includes('map stopped rendering'))
    expect(ours).toBeDefined()
    expect((ours![1] as Error).message).toBe('bad frame')
    expect(String(ours![2])).toContain('Flaky')
  })

  it('renders the child again from "Reload this view"', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map"><Flaky /></ErrorBoundary>))
    failing.on = false
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === i18n.t('common.errorBoundary.retry'))!
    act(() => retry.click())
    expect(host.querySelector('[data-testid="ok"]')).not.toBeNull()
  })

  it('offers a full-page reload as a second way out', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map" variant="pane"><Flaky /></ErrorBoundary>))
    const links = [...host.querySelectorAll('a')].map((a) => a.textContent)
    expect(links).toContain(i18n.t('common.errorBoundary.reloadPage'))
    expect(host.textContent).toContain(i18n.t('common.errorBoundary.pane'))
  })

  it('tries again by itself when a reset key changes (another robot, another workspace)', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map" resetKeys={['r1']}><Flaky /></ErrorBoundary>))
    failing.on = false
    act(() => root.render(<ErrorBoundary area="map" resetKeys={['r1']}><Flaky /></ErrorBoundary>))
    expect(host.querySelector('[data-testid="ok"]')).toBeNull()
    act(() => root.render(<ErrorBoundary area="map" resetKeys={['r2']}><Flaky /></ErrorBoundary>))
    expect(host.querySelector('[data-testid="ok"]')).not.toBeNull()
  })

  it('leaves siblings outside it mounted', () => {
    failing.on = true
    act(() => root.render(
      <div>
        <ErrorBoundary area="pane" variant="strip"><Flaky /></ErrorBoundary>
        <button type="button">E-Stop</button>
      </div>,
    ))
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'E-Stop')).toBe(true)
  })

  it('logs the same fault once, however often it comes back, and a new fault again', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map" resetKeys={['r1']}><Flaky /></ErrorBoundary>))
    const retry = () => [...host.querySelectorAll('button')].find((b) => b.textContent === i18n.t('common.errorBoundary.retry'))!
    act(() => retry().click())
    act(() => root.render(<ErrorBoundary area="map" resetKeys={['r2']}><Flaky /></ErrorBoundary>))
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    const ours = () => errorLog.mock.calls.filter((c) => String(c[0]).includes('map stopped rendering'))
    expect(ours()).toHaveLength(1)
    function Other(): never { throw new Error('another fault') }
    act(() => root.render(<ErrorBoundary area="map" resetKeys={['r3']}><Other /></ErrorBoundary>))
    expect(ours()).toHaveLength(2)
  })

  it('keeps the message and the component stack in a closed Details section', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map"><Flaky /></ErrorBoundary>))
    const details = host.querySelector('details')!
    expect(details).not.toBeNull()
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')!.textContent).toBe(i18n.t('common.errorBoundary.details'))
    expect(details.textContent).toContain('bad frame')
    expect(details.textContent).toContain('Flaky')
  })

  it('copies the details: area, message, stack and component stack', async () => {
    failing.on = true
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      act(() => root.render(<ErrorBoundary area="map"><Flaky /></ErrorBoundary>))
      const copy = [...host.querySelectorAll('button')].find((b) => b.textContent === i18n.t('common.errorBoundary.copy'))!
      await act(async () => { copy.click() })
      const text = (writeText.mock.calls[0] as unknown as [string])[0]
      expect(text).toContain('Area: map')
      expect(text).toContain('Error: bad frame')
      expect(text).toContain('Component stack:')
      expect(text).toContain('Flaky')
      expect(host.textContent).toContain(i18n.t('common.errorBoundary.copied'))
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard
    }
  })

  it('offers Copy details in the slim strip too', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="log" variant="strip"><Flaky /></ErrorBoundary>))
    expect(host.querySelector(`button[aria-label="${i18n.t('common.errorBoundary.copy')}"]`)).not.toBeNull()
  })

  it('mounts the children afresh on "Reload this view"', () => {
    failing.on = true
    let mounts = 0
    function Counted() {
      useEffect(() => { mounts += 1 }, [])
      return <Flaky />
    }
    function Parent() {
      return <ErrorBoundary area="map"><Counted /></ErrorBoundary>
    }
    act(() => root.render(<Parent />))
    failing.on = false
    const before = mounts
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === i18n.t('common.errorBoundary.retry'))!
    act(() => retry.click())
    expect(host.querySelector('[data-testid="ok"]')).not.toBeNull()
    expect(mounts).toBe(before + 1)
  })

  it('tries again by itself on a change of address', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map"><Flaky /></ErrorBoundary>))
    failing.on = false
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(host.querySelector('[data-testid="ok"]')).not.toBeNull()
  })

  it('stays down on a change of address when told not to reset on navigation', () => {
    failing.on = true
    act(() => root.render(<ErrorBoundary area="map" resetOnNavigate={false}><Flaky /></ErrorBoundary>))
    failing.on = false
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(host.querySelector('[data-testid="ok"]')).toBeNull()
  })
})

describe('onCaughtError (the root option)', () => {
  it("drops React's second log for our boundaries and keeps any other", () => {
    const ours = new ErrorBoundary({ area: 'x', children: null })
    onCaughtError(new Error('ours'), { componentStack: '', errorBoundary: ours })
    expect(errorLog).not.toHaveBeenCalled()
    onCaughtError(new Error('library'), { componentStack: '\n in Lib', errorBoundary: {} })
    expect(errorLog).toHaveBeenCalledTimes(1)
  })
})

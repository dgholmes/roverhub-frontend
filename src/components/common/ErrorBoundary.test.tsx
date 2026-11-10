// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ErrorBoundary } from './ErrorBoundary'

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
})

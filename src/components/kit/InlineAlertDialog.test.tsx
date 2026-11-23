// @vitest-environment jsdom
import { act, StrictMode, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InlineAlertDialog } from './InlineAlertDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

/** An opener that is hidden while the question is open, as ProcessAgain's is. */
function Asker({ hideOpener = false, autofocus = 'cancel' }: { hideOpener?: boolean; autofocus?: 'cancel' | 'input' }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <div>
      {!(hideOpener && open) && <button ref={opener} data-opener onClick={() => setOpen(true)}>Delete</button>}
      {open && (
        <InlineAlertDialog label="Delete" describedBy="why" onClose={() => setOpen(false)} returnFocus={opener}>
          <p id="why">Cannot be undone.</p>
          {autofocus === 'input' && <input data-autofocus data-typed />}
          <button data-go>Delete for good</button>
          <button data-autofocus={autofocus === 'cancel' ? true : undefined} data-cancel onClick={() => setOpen(false)}>Cancel</button>
        </InlineAlertDialog>
      )}
    </div>
  )
}

const q = (sel: string) => host.querySelector<HTMLElement>(sel)

describe('InlineAlertDialog', () => {
  it('is an alertdialog named and described, focused on its safe control when it opens', () => {
    act(() => root.render(<StrictMode><Asker /></StrictMode>))
    act(() => { q('[data-opener]')!.focus(); q('[data-opener]')!.click() })
    const dialog = q('[role="alertdialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Delete')
    expect(dialog.getAttribute('aria-describedby')).toBe('why')
    expect(document.activeElement).toBe(q('[data-cancel]'))
  })

  it('focuses the typed-confirm input when that is the one marked', () => {
    act(() => root.render(<Asker autofocus="input" />))
    act(() => { q('[data-opener]')!.click() })
    expect(document.activeElement).toBe(q('[data-typed]'))
  })

  it('Escape closes it, and focus goes back to the control that opened it', () => {
    act(() => root.render(<StrictMode><Asker /></StrictMode>))
    act(() => { q('[data-opener]')!.focus(); q('[data-opener]')!.click() })
    act(() => { q('[data-cancel]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(q('[role="alertdialog"]')).toBeNull()
    expect(document.activeElement).toBe(q('[data-opener]'))
  })

  it('gives focus back without scrolling, so a scroll the answer started is not fought', () => {
    act(() => root.render(<Asker />))
    act(() => { q('[data-opener]')!.click() })
    const focus = vi.spyOn(q('[data-opener]')!, 'focus')
    act(() => { q('[data-cancel]')!.click() })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('leaves focus alone when the opener is disabled by the answer (e.g. sent)', () => {
    function Sender() {
      const [open, setOpen] = useState(false)
      const [sent, setSent] = useState(false)
      const opener = useRef<HTMLButtonElement>(null)
      return (
        <div>
          <button ref={opener} data-opener disabled={sent} onClick={() => setOpen(true)}>Process again</button>
          {open && (
            <InlineAlertDialog label="Process again" onClose={() => setOpen(false)} returnFocus={opener}>
              <button data-go onClick={() => { setSent(true); setOpen(false) }}>Process again</button>
              <button data-autofocus data-cancel onClick={() => setOpen(false)}>Cancel</button>
            </InlineAlertDialog>
          )}
        </div>
      )
    }
    act(() => root.render(<Sender />))
    act(() => { q('[data-opener]')!.click() })
    const focus = vi.spyOn(q('[data-opener]')!, 'focus')
    act(() => { q('[data-go]')!.click() })
    expect(focus).not.toHaveBeenCalled()
  })

  it('returns focus to an opener that was hidden while it was open', () => {
    act(() => root.render(<Asker hideOpener />))
    act(() => { q('[data-opener]')!.click() })
    expect(q('[data-opener]')).toBeNull()
    act(() => { q('[data-cancel]')!.click() })
    expect(document.activeElement).toBe(q('[data-opener]'))
  })
})

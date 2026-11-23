import { useEffect, useRef } from 'react'

/**
 * A question asked in place -- "Delete this recording?", "Trim this floor?" --
 * inside the page's own layout rather than over it, so the Radix dialog (a
 * modal with an overlay) does not fit. It still behaves as a dialog should:
 *   - on open, focus moves into it: to the control marked `data-autofocus`
 *     (the safe answer, or the typed-confirm field), else the dialog itself;
 *   - Escape closes it (`onClose`), like its Cancel;
 *   - on close, focus goes back to `returnFocus`, the control that opened it.
 *     The ref is read on close, so an opener hidden while the question was
 *     open and shown again afterwards still gets it.
 * Mount it only while the question is open.
 */
/** Focus the opener again: the ref's current node (a re-shown opener), else
 *  what had focus when the dialog opened -- if it is still there and enabled. */
function focusBack(ref: React.RefObject<HTMLElement | null> | undefined, opened: HTMLElement | null) {
  const back = ref?.current ?? opened
  if (back && back.isConnected && !(back as HTMLButtonElement).disabled) back.focus()
}

export function InlineAlertDialog({
  as = 'div', label, labelledBy, describedBy, onClose, returnFocus, onSubmit, style, children, ...rest
}: {
  as?: 'div' | 'form'
  /** The dialog's name, or the id of what names it. */
  label?: string
  labelledBy?: string
  /** The id of the sentence that says what will happen. */
  describedBy?: string
  onClose: () => void
  returnFocus?: React.RefObject<HTMLElement | null>
  onSubmit?: React.FormEventHandler<HTMLFormElement>
  style?: React.CSSProperties
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'onSubmit' | 'role' | 'style' | 'children'>) {
  const ref = useRef<HTMLElement | null>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  useEffect(() => {
    const opened = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = ref.current
    ;(el?.querySelector<HTMLElement>('[data-autofocus]') ?? el)?.focus()
    // Passive cleanups run after the commit that removed the dialog, so a
    // re-shown opener's ref is attached by then: read it then, not now.
    return () => focusBack(returnFocus, opened)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [])

  const props = {
    ...rest,
    ref: (node: HTMLElement | null) => { ref.current = node },
    role: 'alertdialog',
    'aria-label': label,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    tabIndex: -1,
    style: { outline: 'none', ...style },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      rest.onKeyDown?.(e)
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      close.current()
    },
  }
  return as === 'form'
    ? <form {...props} onSubmit={onSubmit}>{children}</form>
    : <div {...props}>{children}</div>
}

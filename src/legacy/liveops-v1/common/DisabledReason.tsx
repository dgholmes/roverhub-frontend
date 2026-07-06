import { useState } from 'react'

/**
 * Wraps a command button with the blocked-command feedback rule
 * (docs/05-ui-ux.md §6.4): a brief shake + tooltip reason, not a disappearing
 * or fully native-disabled control (native `disabled` would suppress the
 * tooltip and click in some browsers, so this uses aria-disabled instead).
 */
export function DisabledReasonButton({
  enabled,
  reason,
  onClick,
  children,
  style,
  ...rest
}: {
  enabled: boolean
  reason?: string
  onClick?: () => void
  children: React.ReactNode
  style?: React.CSSProperties
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'style'>) {
  const [shake, setShake] = useState(false)

  function handleClick() {
    if (!enabled) {
      setShake(true)
      setTimeout(() => setShake(false), 350)
      return
    }
    onClick?.()
  }

  return (
    <button
      {...rest}
      onClick={handleClick}
      title={!enabled ? reason : undefined}
      aria-disabled={!enabled}
      className={shake ? 'rh-shake' : undefined}
      style={{ ...style, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.45 }}
    >
      {children}
    </button>
  )
}

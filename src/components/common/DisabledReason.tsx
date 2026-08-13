import { color } from '@/design-system/tokens'
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
      style={{
        ...style,
        cursor: enabled ? 'pointer' : 'not-allowed',
        // Was `opacity: 0.45`, which multiplied whatever colour the button
        // already used: over ActionButton's `t2` foreground that landed at
        // 2.07:1, so a disabled command was unreadable rather than merely
        // de-emphasised. An explicit disabled colour keeps it legible — the
        // operator still needs to know which command is blocked.
        // docs/audit/2026-08-12-ui-ux-audit.md A-21.
        ...(enabled ? null : { color: color.t4, opacity: 0.9 }),
      }}
    >
      {children}
    </button>
  )
}

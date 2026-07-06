import { color, font, layout, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

/** Vertical icon+label command button matching the original CurrentTask
 * action-button design. Availability/reason comes from commandPolicy. */
export function ActionButton({
  icon: Icon, label, availability, onClick, variant = 'default',
}: {
  icon: React.ElementType
  label: string
  availability: CommandAvailability
  onClick: () => void
  variant?: 'default' | 'primary'
}) {
  const bg = variant === 'primary' ? color.accent : color.card
  const border = variant === 'primary' ? color.accentBorder : color.border
  const fg = variant === 'primary' ? color.accentText : color.t2

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
        background: bg, border: `1px solid ${border}`, borderRadius: radius.md,
        color: fg, fontFamily: font.family, flexShrink: 0,
      }}
    >
      <Icon size={16} strokeWidth={variant === 'primary' ? 2.5 : 1.6} />
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>{label}</span>
    </DisabledReasonButton>
  )
}

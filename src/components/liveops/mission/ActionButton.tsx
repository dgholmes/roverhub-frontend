import { color, font, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

/** Which state a toggle-style command is showing. `default` is a plain
 * command; the others mark a mode that is currently ON, in the colour that
 * mode means everywhere else (blue = operator in control, green = safety
 * feature on, amber = light on). */
export type CommandTone = 'default' | 'blue' | 'green' | 'amber'

const TONE: Record<Exclude<CommandTone, 'default'>, { fg: string; bg: string; border: string }> = {
  blue:  { fg: color.blue,  bg: color.blueBg,  border: color.blueBorder },
  green: { fg: color.green, bg: color.greenBg, border: color.greenBorder },
  amber: { fg: color.amber, bg: color.amberBg, border: color.amberBorder },
}

export const COMMAND_BUTTON_HEIGHT = 36

/**
 * The one look every LiveOps command control shares: a compact horizontal
 * icon + label button. Replaces the 64px vertical tiles, which needed ~1340px
 * for a full row and were the root of the command bar clipping and
 * overlapping at laptop widths (docs/audit/2026-08-12-ui-ux-audit.md A-01).
 */
export function commandButtonStyle(tone: CommandTone = 'default'): React.CSSProperties {
  const t = tone === 'default' ? null : TONE[tone]
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: COMMAND_BUTTON_HEIGHT, padding: '0 12px', flexShrink: 0,
    background: t ? t.bg : color.card,
    border: `1px solid ${t ? t.border : color.border}`,
    borderRadius: radius.sm + 1,
    color: t ? t.fg : color.t1,
    fontFamily: font.family, fontSize: font.size.md, fontWeight: font.weight.medium,
    whiteSpace: 'nowrap',
  }
}

export function CommandFace({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <>
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </>
  )
}

/** Command button whose availability and blocked-reason come from commandPolicy. */
export function ActionButton({
  icon, label, availability, onClick, tone = 'default',
}: {
  icon: React.ElementType
  label: string
  availability: CommandAvailability
  onClick: () => void
  tone?: CommandTone
}) {
  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={onClick}
      style={commandButtonStyle(tone)}
    >
      <CommandFace icon={icon} label={label} />
    </DisabledReasonButton>
  )
}

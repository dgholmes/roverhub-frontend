import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'
import { BarCard } from './BarCard'
import type { CommandAvailability } from '@/types'

export interface OverflowEntry {
  key: string
  label: string
  icon: React.ElementType
  availability: CommandAvailability
  onClick: () => void
}

/**
 * The "..." menu holding command buttons demoted off the LiveOps command row.
 *
 * Exists so width pressure can never cost a control its visibility -- see
 * src/liveops/commandOverflow.ts for the two earlier layouts that each lost a
 * button silently (the E-Stop, then Speak).
 *
 * Rows are laid out horizontally rather than as the row's vertical icon+label
 * buttons, which buys something the row could not offer: the disabled reason
 * sits next to the label instead of hiding in a tooltip. Every button demoted
 * here today is one that cannot be dispatched at all, so "Pause" reading
 * "needs mission executor" in place is strictly more useful than a greyed icon.
 */
export function CommandOverflowMenu({ entries }: { entries: OverflowEntry[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Callers are expected to skip rendering this entirely when nothing is
  // demoted; guarding here too means a trigger can never open an empty menu.
  if (entries.length === 0) return null

  return (
    <div ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('command.overflow.moreTitle', { count: entries.length })}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{ ...commandButtonStyle(), cursor: 'pointer', background: open ? color.cardHover : color.card }}
      >
        <CommandFace icon={MoreHorizontal} label={t('command.overflow.more')} />
      </button>

      <BarCard open={open} onClose={() => setOpen(false)} anchorRef={ref} width={240}>
        {entries.map(({ key, label, icon: Icon, availability, onClick }) => (
          <DisabledReasonButton
            key={key}
            enabled={availability.enabled}
            reason={availability.reason}
            onClick={() => { onClick(); setOpen(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              width: '100%', padding: `${space[2]}px ${space[2]}px`,
              background: 'transparent', border: '1px solid transparent',
              borderRadius: radius.sm, color: color.t2,
              fontFamily: font.family, textAlign: 'left',
            }}
          >
            <Icon size={15} strokeWidth={1.6} />
            <span style={{
              flex: 1, fontSize: font.size.sm, fontWeight: font.weight.semibold,
              color: availability.enabled ? color.t1 : color.t3,
            }}>
              {label}
            </span>
            {!availability.enabled && availability.reason && (
              <span style={{
                fontSize: font.size.xs, color: color.t3, maxWidth: 110,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {availability.reason}
              </span>
            )}
          </DisabledReasonButton>
        ))}
      </BarCard>
    </div>
  )
}

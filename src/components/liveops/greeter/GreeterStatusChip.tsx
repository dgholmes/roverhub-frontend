import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/kit'
import { color, font, space } from '@/design-system/tokens'
import { greeterChip } from '@/liveops/greeter'
import type { GreeterStatus } from '@/types'

/**
 * Greeter mode's status in one chip: Off, Watching (green dot), Greeting
 * (accent), Cooldown, or Blocked (amber) with the reason in plain words beside
 * it. Used by the Greeter panel in LiveOps and by Fleet's overview, so the two
 * cannot word it differently.
 */
export function GreeterStatusChip({ status, showReason = true }: { status: GreeterStatus; showReason?: boolean }) {
  const { t } = useTranslation()
  const chip = greeterChip(status)
  const reason = chip.reason ? ('key' in chip.reason ? t(chip.reason.key) : chip.reason.raw) : null
  return (
    <span data-greeter-phase={chip.phase} style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', minWidth: 0 }}>
      <Badge tone={chip.tone} dot={chip.dot}>{t(chip.labelKey)}</Badge>
      {showReason && reason && (
        <span data-greeter-reason="" style={{ fontSize: font.size.sm, color: color.amber }}>{reason}</span>
      )}
    </span>
  )
}

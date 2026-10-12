import { color, font, radius } from '@/design-system/tokens'
import { badgeCopyForQuality } from '@/liveops/positionBadge'
import type { PositionQuality } from '@/types/robotState'

/**
 * Amber pill communicating that a position value cannot be trusted at face
 * value (docs/05-ui-ux.md §7.1 — a capability limitation, not a warning).
 * Required on every position value (§18.4); use `compact` when space is tight.
 * Which copy applies is decided by badgeCopyForQuality — see it for why this
 * keys on `quality` and not `provider`.
 */
export function EstimatedBadge({
  quality, compact = false,
}: { quality: PositionQuality; compact?: boolean }) {
  const copy = badgeCopyForQuality(quality)
  if (copy === null) return null

  return (
    <span
      title={copy.title}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20,
        padding: '0 6px', borderRadius: radius.xs + 1,
        background: color.amberBg, border: `1px solid ${color.amberBorder}`,
        color: color.amber, fontSize: font.size.xs, fontWeight: font.weight.semibold,
        whiteSpace: 'nowrap', fontVariantNumeric: 'normal',
      }}
    >
      {compact ? copy.compact : copy.full}
    </span>
  )
}

import { color, font, radius } from '@/design-system/tokens'

/**
 * Non-dismissible amber pill communicating a capability limitation (no GPS in
 * MVP — dead-reckoning only), not a warning/error (docs/05-ui-ux.md §7.1).
 * Required on every position value, regardless of space (§18.4) — use
 * `compact` to render "est." instead of "estimated" when space is tight.
 */
export function EstimatedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="Position is dead-reckoned, not GPS — may drift from the true location"
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '1px 6px', borderRadius: radius.xs,
        background: color.amberBg, border: `1px solid ${color.amberBorder}`,
        color: color.amber, fontSize: font.size['2xs'], fontWeight: font.weight.bold,
        letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}
    >
      {compact ? 'est.' : 'estimated'}
    </span>
  )
}
